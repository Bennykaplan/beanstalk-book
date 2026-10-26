import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, characterPrompt, pagePrompt, editPrompt } from './story.js';
import { buildBook } from './pdf.js';

// Local runs read .env; on Render the key comes from the dashboard's environment settings.
const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* no .env file */ }

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 30);
const PORT = process.env.PORT || 3020;

if (!API_KEY) console.warn('GEMINI_API_KEY is not set; generation requests will fail.');

const BOOK = PAGES.filter((p) => p.enabled);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(DIR, 'public')));

app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/api/book', (_req, res) => {
  res.json(BOOK.map(({ id, title, text, textArea }, i) => ({ id, number: i + 1, title, text, textArea })));
});

// Simple in-memory per-IP limiter so a public URL can't drain the balance.
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: 'Hourly generation limit reached. Try again later.' });
  }
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Expected a JPEG, PNG or WebP image.');
  return { mime_type: m[1], data: m[2] };
}

// Exactly one request per user action: no retries, no loops.
async function generateImage(prompt, images) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...images.map((img) => ({ inline_data: img }))] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } },
      }),
    },
  );
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `Gemini returned HTTP ${r.status}`);
  const parts = body.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) {
    const why = parts.find((p) => p.text)?.text || body.candidates?.[0]?.finishReason || 'no image returned';
    throw new Error(`The model did not return an image (${why}).`);
  }
  const { mimeType, mime_type, data } = img.inlineData || img.inline_data;
  return `data:${mimeType || mime_type};base64,${data}`;
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req.body));
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
};

const findPage = (id) => {
  const i = BOOK.findIndex((p) => p.id === id);
  if (i < 0) throw Object.assign(new Error('Unknown page.'), { status: 400 });
  return [BOOK[i], i + 1];
};

// Photo -> Jack's character sheet: the one reference image used on every page.
app.post('/api/character', rateLimit, handle(async ({ photo }) => ({
  image: await generateImage(characterPrompt(), [parseDataUrl(photo)]),
})));

app.post('/api/page', rateLimit, handle(async ({ page, character }) => {
  const [p, n] = findPage(page);
  return { image: await generateImage(pagePrompt(p, n), [parseDataUrl(character)]) };
}));

// Same page, one thing changed: edit the existing art instead of regenerating it.
app.post('/api/edit', rateLimit, handle(async ({ image, character, instruction }) => {
  const text = String(instruction || '').trim().slice(0, 300);
  if (!text) throw Object.assign(new Error('Describe what to change.'), { status: 400 });
  return { image: await generateImage(editPrompt(text), [parseDataUrl(image), parseDataUrl(character)]) };
}));

app.post('/api/pdf', (req, res) => {
  try {
    const { images = {}, character, about = {} } = req.body;
    const pages = BOOK.map((p) => {
      parseDataUrl(images[p.id]);
      return { image: images[p.id], text: p.text, textArea: p.textArea };
    });
    if (character) parseDataUrl(character);
    const clip = (v, n) => String(v || '').trim().slice(0, n);
    const doc = buildBook({
      pages,
      character,
      about: { name: clip(about.name, 40), age: clip(about.age, 20), favorites: clip(about.favorites, 200), bio: clip(about.bio, 500) },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="JackAndTheBeanstalk.pdf"');
    doc.pipe(res);
  } catch (e) {
    res.status(400).json({ error: `Every page needs art before the PDF can be built. (${e.message})` });
  }
});

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT} (model ${MODEL})`));
