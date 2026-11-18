// Making a book: the uploaded child is edited into the 20 pre-generated scenes of the chosen
// story, all pages at once. Each page is checked by a vision model and redone if it fails,
// up to 3 tries; if all 3 fail, the best one is kept. The check also finds faces and key
// objects, so the words can be placed where they cover nothing.
import { query, toBuffer } from './db.js';
import { log } from './log.js';
import { STORIES, TEMPLATE, heroSheetPrompt, swapPrompt, editPrompt, analysisPrompt } from './stories.js';
import { generateImage, analyzeImage, thumbnail, MODEL, QUALITY, ANALYSIS_MODEL } from './images.js';
import { placeText } from './layout.js';
import { credit, BOOK_PRICE_CENTS } from './wallet.js';

export const MAX_TRIES = 3;
export const pageSlot = (i) => `p${String(i + 1).padStart(2, '0')}`;
export const slotIndex = (slot) => Number(slot.slice(1)) - 1;

async function logCall(ctx, slot, action, model, ms, ok, error, cost) {
  log(action.startsWith('image') ? 'image' : 'check', { book: ctx.bookId, user: ctx.userId, slot, action, ms, ok, error, cost });
  await query(
    `INSERT INTO generation_log (user_id, book_id, slot, action, model, quality, ms, ok, error, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [ctx.userId, ctx.bookId, slot, action, model, action.startsWith('image') ? QUALITY : null, ms, ok, error, cost],
  ).catch((e) => log('error', { where: 'generation_log', error: e.message }));
}

export async function setSlot(bookId, slot, status, f = {}) {
  await query(
    `INSERT INTO images (book_id, slot, status, mime, data, thumb, error, started_at, attempts, score, passed, analysis, layout, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 0), $10, $11, $12, $13, now())
     ON CONFLICT (book_id, slot) DO UPDATE SET
       status = $3, mime = COALESCE($4, images.mime), data = COALESCE($5, images.data), thumb = COALESCE($6, images.thumb),
       error = $7, started_at = COALESCE($8, images.started_at), attempts = COALESCE($9, images.attempts),
       score = COALESCE($10, images.score), passed = COALESCE($11, images.passed),
       analysis = COALESCE($12, images.analysis), layout = COALESCE($13, images.layout), updated_at = now()`,
    [bookId, slot, status, f.mime ?? null, f.data ?? null, f.thumb ?? null, f.error ?? null, f.started ? new Date() : null,
      f.attempts ?? null, f.score ?? null, f.passed ?? null, f.analysis ? JSON.stringify(f.analysis) : null, f.layout ? JSON.stringify(f.layout) : null],
  );
}

export async function setStage(bookId, stage, extra = '') {
  await query(`UPDATE books SET stage = $1 ${extra} WHERE id = $2`, [stage, bookId]);
}

// One number per check, to pick the best of three when none pass.
function scoreOf(a) {
  if (!a) return 0;
  return (a.hero_visible ? 3 : 0) + Number(a.likeness || 0) * 0.5 + Number(a.scene_match || 0) * 0.3 - (a.defects?.length || 0) * 1.5;
}
const passes = (a) => a && a.hero_visible && a.likeness >= 7 && a.scene_match >= 6 && !(a.defects?.length);

async function loadScene(story, index) {
  const { rows } = await query('SELECT mime, data, analysis FROM scenes WHERE story = $1 AND page = $2', [story, index + 1]);
  if (!rows[0]) throw new Error(`Scene ${index + 1} of ${story} is missing.`);
  return { mime: rows[0].mime, data: toBuffer(rows[0].data), analysis: rows[0].analysis };
}

export async function loadBibleHero(bookId) {
  const { rows } = await query("SELECT mime, data FROM bible WHERE book_id = $1 AND key = 'hero'", [bookId]);
  return rows[0] ? { mime: rows[0].mime, data: toBuffer(rows[0].data) } : null;
}

// Makes one page with up to 3 tries. ref is the photo (first run) or the stored character sheet.
async function makePage(ctx, index, ref, refKind, firstTry = null) {
  const story = STORIES[ctx.story];
  const slot = pageSlot(index);
  const page = story.pages[index];
  const tries = [];
  try {
    const scene = firstTry ? null : await loadScene(ctx.story, index);
    for (let n = 1; n <= MAX_TRIES; n++) {
      await setSlot(ctx.bookId, slot, n === 1 ? 'painting' : 'retrying', { attempts: n, started: n === 1 });
      let image;
      const t0 = Date.now();
      try {
        image = n === 1 && firstTry ? await firstTry() : await generateImage(swapPrompt(story, refKind), [scene, ref]);
        await logCall(ctx, slot, n === 1 && firstTry ? 'image:edit' : 'image:page', MODEL, Date.now() - t0, true, null, image.cost);
      } catch (e) {
        await logCall(ctx, slot, 'image:page', MODEL, Date.now() - t0, false, e.message, 0);
        continue;
      }
      await setSlot(ctx.bookId, slot, 'checking', { attempts: n });
      let analysis = null;
      const t1 = Date.now();
      try {
        const checked = await analyzeImage(analysisPrompt(story, index, refKind), [image, ref]);
        analysis = checked.result;
        await logCall(ctx, slot, 'check', ANALYSIS_MODEL, Date.now() - t1, true, null, checked.cost);
      } catch (e) {
        await logCall(ctx, slot, 'check', ANALYSIS_MODEL, Date.now() - t1, false, e.message, 0);
      }
      tries.push({ image, analysis, score: scoreOf(analysis), passed: passes(analysis) });
      if (passes(analysis) || !analysis) break; // An unchecked image is kept rather than paid for twice.
    }
    if (!tries.length) throw new Error('The image could not be made.');
    const best = tries.find((t) => t.passed) || tries.reduce((a, b) => (b.score > a.score ? b : a));
    // No analysis means no boxes: the safe panel layout never covers the picture.
    const layout = best.analysis?.important ? placeText(page.text, best.analysis.important, TEMPLATE[index].quiet) : { mode: 'panel', fontSize: 24 };
    await setSlot(ctx.bookId, slot, 'done', {
      ...best.image, thumb: await thumbnail(best.image.data), attempts: tries.length, score: best.score,
      passed: best.passed, analysis: best.analysis ?? { unchecked: true }, layout,
    });
    return true;
  } catch (e) {
    await setSlot(ctx.bookId, slot, 'error', { error: e.message, attempts: tries.length });
    log('error', { where: 'makePage', book: ctx.bookId, slot, error: e.message });
    return false;
  }
}

async function makeSheet(ctx, photo) {
  const story = STORIES[ctx.story];
  await setSlot(ctx.bookId, 'sheet', 'painting', { attempts: 1, started: true });
  const t0 = Date.now();
  try {
    const image = await generateImage(heroSheetPrompt(story), [photo]);
    await logCall(ctx, 'sheet', 'image:sheet', MODEL, Date.now() - t0, true, null, image.cost);
    await query(
      `INSERT INTO bible (story, key, book_id, description, mime, data) VALUES ($1, 'hero', $2, $3, $4, $5)
       ON CONFLICT (story, key, COALESCE(book_id, '00000000-0000-0000-0000-000000000000')) DO UPDATE SET mime = $4, data = $5, updated_at = now()`,
      [ctx.story, ctx.bookId, `${story.hero}, played by the child in this book`, image.mime, image.data],
    );
    await setSlot(ctx.bookId, 'sheet', 'done', { ...image, thumb: await thumbnail(image.data), attempts: 1 });
    return image;
  } catch (e) {
    await logCall(ctx, 'sheet', 'image:sheet', MODEL, Date.now() - t0, false, e.message, 0);
    await setSlot(ctx.bookId, 'sheet', 'error', { error: e.message });
    return null;
  }
}

// The whole book. The photo lives only in this function's memory, for the length of the run.
export async function runBook(ctx, photo) {
  const start = Date.now();
  await setStage(ctx.bookId, 'painting');
  const pages = TEMPLATE.map((_, i) => makePage(ctx, i, photo, 'photo'));
  const sheet = makeSheet(ctx, photo); // Queued after the pages, so it never slows them down.
  const results = await Promise.all(pages);
  await setStage(ctx.bookId, 'finishing');
  await sheet;
  const made = results.filter(Boolean).length;
  if (made === 0) {
    await setStage(ctx.bookId, 'failed');
    await credit(ctx.userId, BOOK_PRICE_CENTS, 'Refund: book could not be made', { bookId: ctx.bookId });
    return;
  }
  await setStage(ctx.bookId, made === TEMPLATE.length ? 'ready' : 'partial', ', ready_ms = $3'.replace('$3', String(Date.now() - start)));
  log('book_ready', { book: ctx.bookId, user: ctx.userId, ms: Date.now() - start, pages: made });
}

// Re-make one page later, from the stored character sheet.
export async function remakePage(ctx, index) {
  const hero = await loadBibleHero(ctx.bookId);
  if (!hero) throw new Error('This book has no character sheet.');
  await makePage(ctx, index, hero, 'sheet');
}

// "Change one thing": the first try edits the existing page; if the check fails, it retries
// the same edit up to 3 tries in all.
export async function editPage(ctx, index, instruction) {
  const hero = await loadBibleHero(ctx.bookId);
  const { rows } = await query('SELECT mime, data FROM images WHERE book_id = $1 AND slot = $2', [ctx.bookId, pageSlot(index)]);
  if (!hero || !rows[0]) throw new Error('Make this page first.');
  const current = { mime: rows[0].mime, data: toBuffer(rows[0].data) };
  const prompt = editPrompt(STORIES[ctx.story], instruction);
  await makePage(ctx, index, hero, 'sheet', () => generateImage(prompt, [current, hero]));
}
