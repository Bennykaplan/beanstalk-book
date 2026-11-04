import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local runs read .env; on Render the settings come from the dashboard. This has to happen
// before the modules below read process.env, hence the dynamic imports.
const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* no .env file */ }

const { PAGES, characterPrompt, pagePrompt, editPrompt } = await import('./story.js');
const { buildBook } = await import('./pdf.js');
const { initDb, query, toBuffer } = await import('./db.js');
const { log, requestLog } = await import('./log.js');
const { authRoutes, loadUser, requireUser, DEV_LOGIN } = await import('./auth.js');
const { generateImage, withImageTurn, MODEL, QUALITY } = await import('./images.js');

const PORT = process.env.PORT || 3020;
const IMAGES_PER_USER_PER_DAY = Number(process.env.IMAGES_PER_USER_PER_DAY || 25);
const IMAGES_PER_DAY = Number(process.env.IMAGES_PER_DAY || 150);
// A server restart kills in-flight images. Anything unfinished for this long is reported as failed.
const STALE_MS = 6 * 60_000;

const BOOK = PAGES.filter((p) => p.enabled);
const SLOTS = ['character', ...BOOK.map((p) => p.id)];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(requestLog);
app.use(express.static(path.join(DIR, 'public')));
app.use(express.json({ limit: '15mb' }));
app.use(loadUser);

app.get('/healthz', (_req, res) => res.send('ok'));
authRoutes(app);

app.get('/api/me', (req, res) => {
  res.json({ user: req.user ? { name: req.user.name, email: req.user.email } : null, devLogin: DEV_LOGIN });
});

app.get('/api/storyboard', (_req, res) => {
  res.json(BOOK.map(({ id, title, text, textArea }, i) => ({ id, number: i + 1, title, text, textArea })));
});

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    if (!e.status) log('error', { path: req.path, user: req.user?.id, error: e.message });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' });
  }
};

function parsePhoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Expected a JPEG, PNG or WebP image.');
  return { mime: m[1], data: Buffer.from(m[2], 'base64') };
}

function parseAbout(about = {}) {
  const clip = (v, n) => String(v || '').trim().slice(0, n);
  return { name: clip(about.name, 40), age: clip(about.age, 20), favorites: clip(about.favorites, 200), bio: clip(about.bio, 500) };
}

// Every book lookup goes through here, so one user can never reach another user's book.
async function ownedBook(req) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Book not found.');
  const { rows } = await query('SELECT id, about, created_at FROM books WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Book not found.');
  return rows[0];
}

// Sign-in is open to any Gmail, so spending is capped per user and overall.
async function checkBudget(userId, needed) {
  // Images in flight count too, or rapid clicks could start more than the limit.
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE user_id = $1) AS mine, count(*) AS total FROM (
       SELECT user_id FROM generation_log WHERE created_at > now() - interval '1 day'
       UNION ALL
       SELECT b.user_id FROM images i JOIN books b ON b.id = i.book_id WHERE i.status IN ('queued', 'generating')
     ) spent`,
    [userId],
  );
  if (Number(rows[0].mine) + needed > IMAGES_PER_USER_PER_DAY) throw new HttpError(429, "You've reached today's image limit. Please try again tomorrow.");
  if (Number(rows[0].total) + needed > IMAGES_PER_DAY) throw new HttpError(429, "The app has reached today's image limit. Please try again tomorrow.");
}

async function setSlot(bookId, slot, status, fields = {}) {
  await query(
    `INSERT INTO images (book_id, slot, status, mime, data, error, started_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (book_id, slot) DO UPDATE SET
       status = $3, mime = COALESCE($4, images.mime), data = COALESCE($5, images.data),
       error = $6, started_at = COALESCE($7, images.started_at), updated_at = now()`,
    [bookId, slot, status, fields.mime ?? null, fields.data ?? null, fields.error ?? null, fields.started ? new Date() : null],
  );
}

// Makes one image and records the outcome. Never throws, so one failed page in a parallel
// batch doesn't stop the others. Returns the image, or null if it failed.
async function makeSlot(ctx, slot, action, prompt, refs) {
  return withImageTurn(async () => {
    const start = Date.now();
    await setSlot(ctx.bookId, slot, 'generating', { started: true });
    let image = null;
    let error = null;
    try {
      image = await generateImage(prompt, refs, slot);
      await setSlot(ctx.bookId, slot, 'done', image);
    } catch (e) {
      error = e.message;
      await setSlot(ctx.bookId, slot, 'error', { error }).catch(() => {});
    }
    const ms = Date.now() - start;
    log('image', { book: ctx.bookId, user: ctx.userId, slot, action, model: MODEL, quality: QUALITY, ms, ok: !error, error });
    await query(
      'INSERT INTO generation_log (user_id, book_id, slot, action, model, quality, ms, ok, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [ctx.userId, ctx.bookId, slot, action, MODEL, QUALITY, ms, !error, error],
    ).catch((e) => log('error', { where: 'generation_log', error: e.message }));
    return image;
  });
}

// Pages all need the character sheet, so it comes first; then the pages run in parallel.
async function runBook(ctx, photo) {
  const character = await makeSlot(ctx, 'character', 'create', characterPrompt(), [photo]);
  if (!character) {
    await Promise.all(BOOK.map((p) => setSlot(ctx.bookId, p.id, 'error', { error: 'Waiting on the character sheet.' })));
    return;
  }
  await Promise.all(BOOK.map((p, i) => makeSlot(ctx, p.id, 'create', pagePrompt(p, i + 1), [character])));
}

async function loadImage(bookId, slot) {
  const { rows } = await query('SELECT mime, data FROM images WHERE book_id = $1 AND slot = $2 AND data IS NOT NULL', [bookId, slot]);
  return rows[0] ? { mime: rows[0].mime, data: toBuffer(rows[0].data) } : null;
}

async function slotStatuses(bookId) {
  await query(
    `UPDATE images SET status = 'error', error = 'This image was interrupted. Please try again.', updated_at = now()
     WHERE book_id = $1 AND status IN ('queued', 'generating') AND updated_at < now() - make_interval(secs => $2)`,
    [bookId, STALE_MS / 1000],
  );
  const { rows } = await query(
    `SELECT slot, status, error, data IS NOT NULL AS has_image, updated_at,
            CASE WHEN status = 'generating' THEN EXTRACT(EPOCH FROM now() - started_at) * 1000 END AS elapsed_ms
     FROM images WHERE book_id = $1`,
    [bookId],
  );
  return Object.fromEntries(rows.map((r) => [r.slot, {
    status: r.status, error: r.error, hasImage: r.has_image, version: new Date(r.updated_at).getTime(), elapsedMs: r.elapsed_ms == null ? null : Number(r.elapsed_ms),
  }]));
}

function requireSettled(slots, slot) {
  if (['queued', 'generating'].includes(slots[slot]?.status)) throw new HttpError(409, 'That image is still being made.');
}

app.use('/api/books', requireUser);

app.get('/api/books', handle(async (req) => {
  const { rows } = await query('SELECT id, about, created_at FROM books WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  return rows;
}));

app.post('/api/books', handle(async (req) => {
  const photo = parsePhoto(req.body.photo);
  await checkBudget(req.user.id, SLOTS.length);
  const { rows } = await query('INSERT INTO books (user_id, about) VALUES ($1, $2) RETURNING id', [req.user.id, JSON.stringify(parseAbout(req.body.about))]);
  const ctx = { bookId: rows[0].id, userId: req.user.id };
  await Promise.all(SLOTS.map((slot) => setSlot(ctx.bookId, slot, 'queued')));
  log('book_created', { book: ctx.bookId, user: ctx.userId });
  // The photo is only ever in memory: it's used to draw the character sheet and never stored.
  runBook(ctx, photo).catch((e) => log('error', { where: 'runBook', book: ctx.bookId, error: e.message }));
  return { id: ctx.bookId };
}));

app.get('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  return { ...book, slots: await slotStatuses(book.id) };
}));

app.patch('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  await query('UPDATE books SET about = $1 WHERE id = $2', [JSON.stringify(parseAbout(req.body.about)), book.id]);
  return { ok: true };
}));

app.delete('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  await query('DELETE FROM books WHERE id = $1', [book.id]);
  log('book_deleted', { book: book.id, user: req.user.id });
  return { ok: true };
}));

// Redo one page from the character sheet. The character sheet itself needs the photo again.
app.post('/api/books/:id/slots/:slot/remake', handle(async (req) => {
  const book = await ownedBook(req);
  const slots = await slotStatuses(book.id);
  const ctx = { bookId: book.id, userId: req.user.id };
  const { slot } = req.params;
  if (!SLOTS.includes(slot)) throw new HttpError(404, 'Unknown page.');
  requireSettled(slots, slot);
  if (slot === 'character') {
    const photo = parsePhoto(req.body.photo);
    const missing = BOOK.filter((p) => !slots[p.id]?.hasImage);
    await checkBudget(req.user.id, 1 + missing.length);
    await setSlot(book.id, slot, 'queued');
    // Pages that never got made because the character sheet failed follow automatically.
    makeSlot(ctx, slot, 'remake', characterPrompt(), [photo]).then((character) => character && Promise.all(
      missing.map((p) => makeSlot(ctx, p.id, 'create', pagePrompt(p, BOOK.indexOf(p) + 1), [character])),
    ));
    return { ok: true };
  }
  const character = await loadImage(book.id, 'character');
  if (!character) throw new HttpError(409, 'Make the character sheet first.');
  await checkBudget(req.user.id, 1);
  await setSlot(book.id, slot, 'queued');
  const i = BOOK.findIndex((p) => p.id === slot);
  makeSlot(ctx, slot, 'remake', pagePrompt(BOOK[i], i + 1), [character]);
  return { ok: true };
}));

// Same page, one thing changed: edit the existing art instead of regenerating it.
app.post('/api/books/:id/slots/:slot/edit', handle(async (req) => {
  const book = await ownedBook(req);
  const { slot } = req.params;
  if (!BOOK.some((p) => p.id === slot)) throw new HttpError(404, 'Unknown page.');
  requireSettled(await slotStatuses(book.id), slot);
  const instruction = String(req.body.instruction || '').trim().slice(0, 300);
  if (!instruction) throw new HttpError(400, 'Describe what to change.');
  const [page, character] = await Promise.all([loadImage(book.id, slot), loadImage(book.id, 'character')]);
  if (!page || !character) throw new HttpError(409, 'Make this page first.');
  await checkBudget(req.user.id, 1);
  await setSlot(book.id, slot, 'queued');
  makeSlot({ bookId: book.id, userId: req.user.id }, slot, 'edit', editPrompt(instruction), [page, character]);
  return { ok: true };
}));

app.get('/api/books/:id/images/:slot', async (req, res) => {
  try {
    const book = await ownedBook(req);
    const image = await loadImage(book.id, req.params.slot);
    if (!image) return res.status(404).end();
    res.set({ 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=86400' }).send(image.data);
  } catch (e) {
    res.status(e.status || 500).end();
  }
});

app.get('/api/books/:id/pdf', async (req, res) => {
  try {
    const book = await ownedBook(req);
    const images = await Promise.all(SLOTS.map((slot) => loadImage(book.id, slot)));
    if (images.some((image) => !image)) throw new HttpError(409, 'Every page needs art before the PDF can be built.');
    const [character, ...pages] = images.map((image) => `data:${image.mime};base64,${image.data.toString('base64')}`);
    const doc = buildBook({
      pages: BOOK.map((p, i) => ({ image: pages[i], text: p.text, textArea: p.textArea })),
      character,
      about: book.about,
    });
    log('pdf', { book: book.id, user: req.user.id });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="JackAndTheBeanstalk.pdf"' });
    doc.pipe(res);
  } catch (e) {
    if (!e.status) log('error', { path: req.path, user: req.user?.id, error: e.message });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' });
  }
});

process.on('unhandledRejection', (e) => log('unhandled_rejection', { error: String(e?.message || e) }));

await initDb(DIR);
app.listen(PORT, () => log('started', { port: Number(PORT), model: MODEL, quality: QUALITY, provider: process.env.IMAGE_PROVIDER || 'openai' }));
