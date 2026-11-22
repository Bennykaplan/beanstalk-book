import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local runs read .env; on Render the settings come from the dashboard. This has to happen
// before the modules below read process.env, hence the dynamic imports.
const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* no .env file */ }

const { STORIES, TEMPLATE } = await import('./stories.js');
const { readingPdf, interiorPdf, coverPdf, INTERIOR_PAGES, PUBLISHER } = await import('./pdf.js');
const { initDb, query, toBuffer } = await import('./db.js');
const { log, requestLog } = await import('./log.js');
const { authRoutes, loadUser, requireUser, DEV_LOGIN } = await import('./auth.js');
const { MODEL, QUALITY, MOCK, thumbnail } = await import('./images.js');
const pipeline = await import('./pipeline.js');
const wallet = await import('./wallet.js');
const { checkAbout, checkPhoto } = await import('./validate.js');
const lulu = await import('./lulu.js');
const { seedAssets } = await import('./seed.js');

const PORT = process.env.PORT || 3020;
const IMAGES_PER_USER_PER_DAY = Number(process.env.IMAGES_PER_USER_PER_DAY || 120);
const IMAGES_PER_DAY = Number(process.env.IMAGES_PER_DAY || 600);
// What we add on top of the printer's price for a printed book. See PRICING.md.
const PRINT_MARGIN_CENTS = Number(process.env.PRINT_MARGIN_CENTS || 900);
// A server restart kills in-flight images. Anything unfinished for this long is reported as failed.
const STALE_MS = 6 * 60_000;
const { pageSlot, slotIndex } = pipeline;
const PAGE_SLOTS = TEMPLATE.map((_, i) => pageSlot(i));

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(requestLog);
app.use(express.static(path.join(DIR, 'public'), { maxAge: '5m' }));
app.use(express.json({ limit: '15mb' }));
app.use(loadUser);

app.get('/healthz', (_req, res) => res.send('ok'));
authRoutes(app);

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    if (!e.status) log('error', { path: req.path, user: req.user?.id, error: e.message });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.', field: e.field });
  }
};

app.get('/api/me', handle(async (req) => ({
  user: req.user ? { name: req.user.name, email: req.user.email } : null,
  balanceCents: req.user ? await wallet.balanceCents(req.user.id) : 0,
  bookPriceCents: wallet.BOOK_PRICE_CENTS,
  devLogin: DEV_LOGIN,
})));

app.get('/api/stories', (_req, res) => {
  res.json(Object.values(STORIES).map((s) => ({ id: s.id, title: s.title, hero: s.hero, pages: s.pages.length })));
});

// A small preview of each story for the story picker, from its pre-generated cover scene.
const previews = new Map();
app.get('/api/stories/:id/preview.jpg', async (req, res) => {
  const story = STORIES[req.params.id];
  if (!story) return res.status(404).end();
  if (!previews.has(story.id)) {
    const { rows } = await query('SELECT data FROM scenes WHERE story = $1 AND page = $2', [story.id, story.cover + 1]);
    if (!rows[0]) return res.status(404).end();
    previews.set(story.id, await thumbnail(toBuffer(rows[0].data)));
  }
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }).send(previews.get(story.id));
});

function parsePhoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Please choose a JPEG, PNG or WebP photo.', 'photo');
  return { mime: m[1], data: Buffer.from(m[2], 'base64') };
}

// Every book lookup goes through here, so one user can never reach another user's book.
async function ownedBook(req, id = req.params.id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Book not found.');
  const { rows } = await query('SELECT id, about, story, stage, ready_ms, created_at FROM books WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Book not found.');
  return rows[0];
}

// Sign-in is open to any Gmail, so spending is capped per user and overall, on top of the wallet.
async function checkBudget(userId, needed) {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE user_id = $1) AS mine, count(*) AS total FROM generation_log
     WHERE created_at > now() - interval '1 day' AND action LIKE 'image%'`,
    [userId],
  );
  if (Number(rows[0].mine) + needed > IMAGES_PER_USER_PER_DAY) throw new HttpError(429, "You've reached today's image limit. Please try again tomorrow.");
  if (Number(rows[0].total) + needed > IMAGES_PER_DAY) throw new HttpError(429, "The app has reached today's image limit. Please try again tomorrow.");
}

async function slotStatuses(bookId) {
  await query(
    `UPDATE images SET status = 'error', error = 'This image was interrupted. Please try again.', updated_at = now()
     WHERE book_id = $1 AND status IN ('queued', 'painting', 'checking', 'retrying') AND updated_at < now() - make_interval(secs => $2)`,
    [bookId, STALE_MS / 1000],
  );
  const { rows } = await query(
    `SELECT slot, status, error, data IS NOT NULL AS has_image, attempts, passed, score, layout, updated_at
     FROM images WHERE book_id = $1`,
    [bookId],
  );
  return Object.fromEntries(rows.map((r) => [r.slot, {
    status: r.status, error: r.error, hasImage: r.has_image, attempts: r.attempts, passed: r.passed,
    score: r.score == null ? null : Number(r.score), layout: r.layout, version: new Date(r.updated_at).getTime(),
  }]));
}

const BUSY = ['queued', 'painting', 'checking', 'retrying'];
const isBusy = (s) => s && BUSY.includes(s.status);

// Stage of a book, derived from its images, so it's right even after a restart.
function stageOf(book, slots) {
  if (!book.story) return 'legacy';
  const pages = PAGE_SLOTS.map((s) => slots[s]);
  if (pages.some(isBusy)) return 'painting';
  if (pages.every((p) => p?.hasImage)) return book.stage === 'finishing' ? 'finishing' : 'ready';
  return pages.some((p) => p?.hasImage) ? 'partial' : 'failed';
}

// ---- Wallet ----

app.use('/api/wallet', requireUser);

app.get('/api/wallet', handle(async (req) => ({
  balanceCents: await wallet.balanceCents(req.user.id),
  bookPriceCents: wallet.BOOK_PRICE_CENTS,
  depositOptions: wallet.DEPOSIT_OPTIONS,
  history: await wallet.history(req.user.id),
  cost: await wallet.costStats(),
})));

app.post('/api/wallet/deposit', handle(async (req) => ({ url: await wallet.startDeposit(req.user.id, Number(req.body.cents), baseUrl(req)) })));
app.post('/api/wallet/confirm', handle(async (req) => wallet.confirmDeposit(req.user.id, String(req.body.session || ''))));
app.post('/api/wallet/refund', handle(async (req) => wallet.refund(req.user.id, Number(req.body.depositId), Number(req.body.cents))));

// ---- Books ----

app.use('/api/books', requireUser);

app.get('/api/books', handle(async (req) => {
  const { rows } = await query(
    `SELECT b.id, b.about, b.story, b.created_at,
            (SELECT count(*) FROM images i WHERE i.book_id = b.id AND i.slot LIKE 'p%' AND i.data IS NOT NULL) AS pages_done
     FROM books b WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
    [req.user.id],
  );
  return rows.map((b) => ({
    id: b.id, name: b.about.name, story: b.story, title: STORIES[b.story]?.title || 'Early 3-page draft',
    createdAt: b.created_at, pagesDone: Number(b.pages_done), coverSlot: STORIES[b.story] ? pageSlot(STORIES[b.story].cover) : null,
  }));
}));

app.post('/api/checks/about', requireUser, handle(async (req) => ({ about: await checkAbout(req.body.about) })));

app.post('/api/books', handle(async (req) => {
  const story = STORIES[req.body.story];
  if (!story) throw new HttpError(400, 'Choose a story.', 'story');
  const photo = parsePhoto(req.body.photo);
  const about = await checkAbout(req.body.about);
  await checkPhoto(photo);
  const { rows: scenes } = await query('SELECT count(*) AS n FROM scenes WHERE story = $1', [story.id]);
  if (Number(scenes[0].n) < TEMPLATE.length) throw new HttpError(503, 'This story is still being prepared. Please try again later.');
  await checkBudget(req.user.id, TEMPLATE.length + 1);
  const { rows } = await query('INSERT INTO books (user_id, about, story, stage) VALUES ($1, $2, $3, $4) RETURNING id', [req.user.id, JSON.stringify(about), story.id, 'painting']);
  const ctx = { bookId: rows[0].id, userId: req.user.id, story: story.id, age: about.age };
  try {
    await wallet.charge(req.user.id, wallet.BOOK_PRICE_CENTS, 'book', `Book: ${story.title}, starring ${about.name}`, { bookId: ctx.bookId });
  } catch (e) {
    await query('DELETE FROM books WHERE id = $1', [ctx.bookId]);
    throw e;
  }
  await Promise.all(PAGE_SLOTS.map((slot) => pipeline.setSlot(ctx.bookId, slot, 'queued')));
  log('book_created', { book: ctx.bookId, user: ctx.userId, story: story.id });
  // The photo is only ever in memory: it's used while the book is made and never stored.
  pipeline.runBook(ctx, photo).catch((e) => log('error', { where: 'runBook', book: ctx.bookId, error: e.message }));
  return { id: ctx.bookId };
}));

app.get('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  const slots = await slotStatuses(book.id);
  const story = STORIES[book.story];
  return {
    id: book.id, about: book.about, story: book.story, createdAt: book.created_at, readyMs: book.ready_ms,
    title: story?.title, hero: story?.hero, stage: stageOf(book, slots), slots,
    pages: story ? story.pages.map((p, i) => ({ slot: pageSlot(i), number: i + 1, text: p.text })) : [],
    cost: await wallet.bookCost(book.id), maxTries: pipeline.MAX_TRIES,
  };
}));

app.patch('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  const about = await checkAbout(req.body.about);
  await query('UPDATE books SET about = $1 WHERE id = $2', [JSON.stringify(about), book.id]);
  return { about };
}));

app.delete('/api/books/:id', handle(async (req) => {
  const book = await ownedBook(req);
  await query('DELETE FROM books WHERE id = $1', [book.id]);
  log('book_deleted', { book: book.id, user: req.user.id });
  return { ok: true };
}));

async function pageAction(req, run) {
  const book = await ownedBook(req);
  if (!book.story) throw new HttpError(409, 'This early draft can’t be changed.');
  const { slot } = req.params;
  if (!PAGE_SLOTS.includes(slot)) throw new HttpError(404, 'Unknown page.');
  const slots = await slotStatuses(book.id);
  if (isBusy(slots[slot])) throw new HttpError(409, 'That page is still being made.');
  await checkBudget(req.user.id, pipeline.MAX_TRIES);
  await pipeline.setSlot(book.id, slot, 'queued', { attempts: 0 });
  const ctx = { bookId: book.id, userId: req.user.id, story: book.story, age: book.about?.age };
  run(ctx, slotIndex(slot)).catch((e) => log('error', { where: 'pageAction', book: book.id, error: e.message }));
  return { ok: true };
}

app.post('/api/books/:id/slots/:slot/remake', handle((req) => pageAction(req, pipeline.remakePage)));
app.post('/api/books/:id/slots/:slot/edit', handle((req) => {
  const instruction = String(req.body.instruction || '').trim().slice(0, 300);
  if (!instruction) throw new HttpError(400, 'Describe what to change.');
  return pageAction(req, (ctx, i) => pipeline.editPage(ctx, i, instruction));
}));

// The character bible: the story's shared characters, plus this book's hero.
app.get('/api/books/:id/bible', handle(async (req) => {
  const book = await ownedBook(req);
  const { rows } = await query(
    `SELECT key, description, book_id IS NOT NULL AS own FROM bible
     WHERE story = $1 AND ((book_id IS NULL AND key <> 'hero') OR book_id = $2) ORDER BY book_id IS NULL, key`,
    [book.story, book.id],
  );
  return rows.map((r) => ({ key: r.key, name: r.description.split(':')[0], own: r.own, url: r.own ? `/api/books/${book.id}/bible/hero.jpg` : `/api/bible/${book.story}/${r.key}.jpg` }));
}));

app.get('/api/books/:id/bible/hero.jpg', async (req, res) => {
  try {
    const book = await ownedBook(req);
    const hero = await pipeline.loadBibleHero(book.id);
    if (!hero) return res.status(404).end();
    res.set({ 'Content-Type': hero.mime, 'Cache-Control': 'private, max-age=3600' }).send(hero.data);
  } catch (e) {
    res.status(e.status || 500).end();
  }
});

const bibleThumbs = new Map();
app.get('/api/bible/:story/:key.jpg', async (req, res) => {
  const id = `${req.params.story}/${req.params.key}`;
  if (!bibleThumbs.has(id)) {
    const { rows } = await query("SELECT data FROM bible WHERE story = $1 AND key = $2 AND key <> 'hero' AND book_id IS NULL", [req.params.story, req.params.key]);
    if (!rows[0]) return res.status(404).end();
    bibleThumbs.set(id, await thumbnail(toBuffer(rows[0].data)));
  }
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }).send(bibleThumbs.get(id));
});

function sendImage(column) {
  return async (req, res) => {
    try {
      const book = await ownedBook(req);
      const { rows } = await query(`SELECT mime, ${column} AS data FROM images WHERE book_id = $1 AND slot = $2`, [book.id, req.params.slot]);
      if (!rows[0]?.data) return res.status(404).end();
      res.set({ 'Content-Type': column === 'thumb' ? 'image/jpeg' : rows[0].mime, 'Cache-Control': 'private, max-age=86400' }).send(toBuffer(rows[0].data));
    } catch (e) {
      res.status(e.status || 500).end();
    }
  };
}
app.get('/api/books/:id/images/:slot', sendImage('data'));
app.get('/api/books/:id/thumbs/:slot', sendImage('thumb'));

// Everything a PDF needs, from the database.
async function bookForPrint(bookRow) {
  const story = STORIES[bookRow.story];
  if (!story) throw new HttpError(409, 'This early draft can’t be made into a PDF.');
  const { rows } = await query('SELECT slot, data, layout, analysis FROM images WHERE book_id = $1 AND data IS NOT NULL', [bookRow.id]);
  const bySlot = Object.fromEntries(rows.map((r) => [r.slot, r]));
  if (!PAGE_SLOTS.every((s) => bySlot[s])) throw new HttpError(409, 'Every page needs its picture before the PDF can be made.');
  const hero = await pipeline.loadBibleHero(bookRow.id);
  return {
    id: bookRow.id, title: story.title, hero_name: story.hero, name: bookRow.about.name, about: bookRow.about,
    createdAt: bookRow.created_at, coverIndex: story.cover, hero: hero?.data,
    pages: story.pages.map((p, i) => {
      const row = bySlot[pageSlot(i)];
      return { text: p.text, image: toBuffer(row.data), layout: row.layout, important: row.analysis?.important };
    }),
  };
}

const fileName = (book) => `${book.title.replace(/\W+/g, '')}.pdf`;

app.get('/api/books/:id/pdf', async (req, res) => {
  try {
    const book = await bookForPrint(await ownedBook(req));
    log('pdf', { book: book.id, user: req.user.id });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName(book)}"` });
    readingPdf(book).pipe(res);
  } catch (e) {
    if (!e.status) log('error', { path: req.path, user: req.user?.id, error: e.message });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' });
  }
});

// ---- Print orders (Lulu sandbox) ----

app.use('/api/orders', requireUser);

async function ownedOrder(req) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Order not found.');
  return rows[0];
}

function orderView(o, book) {
  return {
    id: o.id, bookId: o.book_id, status: o.status, proofViewed: Boolean(o.proof_viewed_at), approved: Boolean(o.approved_at),
    address: o.address, shippingLevel: o.shipping_level, quote: o.quote, priceCents: o.price_cents,
    printerId: o.lulu_id, printerStatus: o.lulu_status, error: o.error, createdAt: o.created_at,
    title: book ? `${STORIES[book.story]?.title}, starring ${book.about.name}` : undefined,
  };
}

app.post('/api/books/:id/orders', handle(async (req) => {
  const book = await ownedBook(req);
  await bookForPrint(book);
  const { rows: open } = await query("SELECT id FROM orders WHERE book_id = $1 AND status IN ('draft', 'approved', 'quoted')", [book.id]);
  if (open[0]) return { id: open[0].id };
  const { rows } = await query("INSERT INTO orders (user_id, book_id, status) VALUES ($1, $2, 'draft') RETURNING id", [req.user.id, book.id]);
  log('order_draft', { order: rows[0].id, user: req.user.id });
  return { id: rows[0].id };
}));

app.get('/api/orders', handle(async (req) => {
  const { rows } = await query(
    `SELECT o.*, b.story, b.about FROM orders o JOIN books b ON b.id = o.book_id
     WHERE o.user_id = $1 AND o.status NOT IN ('draft') ORDER BY o.created_at DESC`,
    [req.user.id],
  );
  return rows.map((o) => orderView(o, o));
}));

app.get('/api/orders/:id', handle(async (req) => {
  let order = await ownedOrder(req);
  if (order.lulu_id && lulu.configured()) {
    try {
      const s = await lulu.jobStatus(order.lulu_id);
      if (s.name !== order.lulu_status) {
        ({ rows: [order] } = await query('UPDATE orders SET lulu_status = $1, updated_at = now() WHERE id = $2 RETURNING *', [s.name, order.id]));
      }
    } catch (e) {
      log('lulu_status_failed', { order: order.id, error: e.message });
    }
  }
  const book = await ownedBook(req, order.book_id);
  return orderView(order, book);
}));

// The proof is the exact book that would be printed. The order can't be approved until it's opened.
app.get('/api/orders/:id/proof.pdf', async (req, res) => {
  try {
    const order = await ownedOrder(req);
    const book = await bookForPrint(await ownedBook(req, order.book_id));
    await query('UPDATE orders SET proof_viewed_at = COALESCE(proof_viewed_at, now()) WHERE id = $1', [order.id]);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="proof.pdf"' });
    readingPdf(book).pipe(res);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' });
  }
});

app.post('/api/orders/:id/approve', handle(async (req) => {
  const order = await ownedOrder(req);
  if (!order.proof_viewed_at) throw new HttpError(409, 'Please open the proof and look through the whole book first.');
  if (!['draft', 'approved', 'quoted'].includes(order.status)) throw new HttpError(409, 'This order has already been placed.');
  await query("UPDATE orders SET status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END, approved_at = COALESCE(approved_at, now()), updated_at = now() WHERE id = $1", [order.id]);
  log('order_approved', { order: order.id, user: req.user.id });
  return { ok: true };
}));

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

function checkAddress(raw = {}) {
  const a = {};
  const field = (key, label, max, required = true) => {
    const v = String(raw[key] ?? '').replace(/\s+/g, ' ').trim();
    if (required && !v) throw new HttpError(400, `Please fill in ${label}.`, key);
    if (v.length > max) throw new HttpError(400, `${label[0].toUpperCase()}${label.slice(1)} can be at most ${max} characters.`, key);
    a[key] = v;
  };
  field('name', 'the name', 35);
  field('street1', 'the street address', 30);
  field('street2', 'the second address line', 30, false);
  field('city', 'the city', 30);
  a.country_code = 'US';
  a.state_code = String(raw.state_code || '').trim().toUpperCase();
  if (!US_STATES.has(a.state_code)) throw new HttpError(400, 'Please choose a state.', 'state_code');
  field('postcode', 'the ZIP code', 10);
  if (!/^\d{5}(-\d{4})?$/.test(a.postcode)) throw new HttpError(400, 'Please enter a 5-digit ZIP code.', 'postcode');
  field('phone_number', 'a phone number', 20);
  if (!/^\+?[\d\s\-./()]{8,20}$/.test(a.phone_number)) throw new HttpError(400, 'Please enter a phone number with area code.', 'phone_number');
  field('email', 'an email address', 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new HttpError(400, 'Please enter a valid email address.', 'email');
  return a;
}

// Our price for a printed book: the printer's total (printing, shipping, fees, tax), plus our
// margin, rounded up to the next .99. The book's generation was already paid with its $0.99.
export function printPrice(printerTotalUsd) {
  const cents = Math.ceil(printerTotalUsd * 100) + PRINT_MARGIN_CENTS;
  return Math.ceil((cents + 1) / 100) * 100 - 1;
}

app.post('/api/orders/:id/quote', handle(async (req) => {
  const order = await ownedOrder(req);
  if (!order.approved_at) throw new HttpError(409, 'Please approve the proof first.');
  if (!['approved', 'quoted'].includes(order.status)) throw new HttpError(409, 'This order has already been placed.');
  const address = checkAddress(req.body.address);
  const level = lulu.SHIPPING_LEVELS.includes(req.body.shippingLevel) ? req.body.shippingLevel : 'MAIL';
  const quote = await lulu.quote(address, level, INTERIOR_PAGES);
  const price = printPrice(quote.total);
  await query("UPDATE orders SET status = 'quoted', address = $1, shipping_level = $2, quote = $3, price_cents = $4, updated_at = now() WHERE id = $5",
    [JSON.stringify(address), level, JSON.stringify(quote), price, order.id]);
  return { priceCents: price, warnings: quote.warnings, shippingLevel: level };
}));

const fileToken = (orderId, file) => crypto.createHmac('sha256', process.env.SESSION_SECRET || 'local-dev-only').update(`${orderId}:${file}`).digest('base64url');

app.post('/api/orders/:id/place', handle(async (req) => {
  const order = await ownedOrder(req);
  if (order.status !== 'quoted' || !order.approved_at) throw new HttpError(409, 'Please approve the proof and enter the delivery address first.');
  const book = await ownedBook(req, order.book_id);
  // Claim the order first, so a double click can't place it twice.
  const { rowCount } = await query("UPDATE orders SET status = 'placing', base_url = $1, updated_at = now() WHERE id = $2 AND status = 'quoted'", [baseUrl(req), order.id]);
  if (!rowCount) throw new HttpError(409, 'This order is already being placed.');
  try {
    await wallet.charge(req.user.id, order.price_cents, 'print', `Printed book: ${STORIES[book.story].title}, starring ${book.about.name}`, { bookId: book.id, orderId: order.id });
  } catch (e) {
    await query("UPDATE orders SET status = 'quoted' WHERE id = $1", [order.id]);
    throw e;
  }
  const files = (file) => `${baseUrl(req)}/print-files/${order.id}/${fileToken(order.id, file)}/${file}.pdf`;
  try {
    const job = await lulu.createPrintJob({
      orderId: order.id,
      title: `${STORIES[book.story].title}, starring ${book.about.name}`,
      address: order.address,
      shippingLevel: order.shipping_level,
      interiorUrl: files('interior'),
      coverUrl: files('cover'),
      contactEmail: order.address.email,
    });
    await query("UPDATE orders SET status = 'placed', lulu_id = $1, lulu_status = $2, updated_at = now() WHERE id = $3", [job.id, job.status, order.id]);
    log('order_placed', { order: order.id, user: req.user.id, printer: job.id });
    return { ok: true };
  } catch (e) {
    await wallet.credit(req.user.id, order.price_cents, 'Refund: the printer did not accept the order', { orderId: order.id });
    await query("UPDATE orders SET status = 'failed', error = $1, updated_at = now() WHERE id = $2", [e.message.slice(0, 300), order.id]);
    log('order_failed', { order: order.id, error: e.message });
    throw new HttpError(502, `The printer didn't accept the order: ${e.message}`);
  }
}));

// The printer downloads the files from here. Each URL carries a token only the server can make.
app.get('/print-files/:orderId/:token/:file.pdf', async (req, res) => {
  try {
    const { orderId, token, file } = req.params;
    const expected = fileToken(Number(orderId), file);
    if (!['interior', 'cover'].includes(file) || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return res.status(404).end();
    const { rows } = await query('SELECT o.id, b.id AS book_id, b.about, b.story, b.created_at FROM orders o JOIN books b ON b.id = o.book_id WHERE o.id = $1', [Number(orderId)]);
    if (!rows[0]) return res.status(404).end();
    const book = await bookForPrint({ id: rows[0].book_id, about: rows[0].about, story: rows[0].story, created_at: rows[0].created_at });
    log('print_file', { order: rows[0].id, file });
    res.set({ 'Content-Type': 'application/pdf' });
    if (file === 'interior') return interiorPdf(book).pipe(res);
    const dims = await lulu.coverDimensions(INTERIOR_PAGES);
    coverPdf(book, dims, dims.spine).pipe(res);
  } catch (e) {
    log('error', { path: req.path, error: e.message });
    res.status(500).end();
  }
});

process.on('unhandledRejection', (e) => log('unhandled_rejection', { error: String(e?.message || e) }));

await initDb(DIR);
await seedAssets(DIR);
app.listen(PORT, () => log('started', {
  port: Number(PORT), model: MODEL, quality: QUALITY, mock: MOCK, publisher: PUBLISHER, printing: lulu.configured() ? 'lulu sandbox' : 'not configured',
}));
