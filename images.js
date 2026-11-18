// Turns a prompt and reference images into one picture, and checks pictures with a vision model.
// IMAGE_PROVIDER=mock returns the first reference image (and a passing check) after a delay and
// costs nothing, for testing the app without spending money.
import sharp from 'sharp';
import { imageCost, chatCost } from './costs.js';

export const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
// Low quality and low input fidelity: tested side by side, the likeness holds, and a page costs
// about 2.5 cents and 9 seconds instead of 15 cents and 20 seconds. See PRICING.md.
export const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'low';
const FIDELITY = process.env.OPENAI_INPUT_FIDELITY || 'low';
export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'gpt-4.1-mini';
export const MOCK = process.env.IMAGE_PROVIDER === 'mock';
const MOCK_FAIL_RATE = Number(process.env.MOCK_FAIL_RATE || 0);

// OpenAI caps image calls per minute by account level (20 a minute at the lowest paid level).
// Calls wait for a free spot instead of failing with a rate-limit error.
const PER_MINUTE = Number(process.env.IMAGES_PER_MINUTE || 20);
// Pages go first; a book's character sheet only takes a spot no page is waiting for.
const started = [];
const waiting = { page: [], later: [] };

function release() {
  const now = Date.now();
  while (started.length && now - started[0] >= 60_000) started.shift();
  while ((waiting.page.length || waiting.later.length) && started.length < PER_MINUTE) {
    started.push(Date.now());
    (waiting.page.shift() || waiting.later.shift())();
  }
  if (waiting.page.length || waiting.later.length) setTimeout(release, 60_000 - (now - started[0]) + 50);
}

function imageTurn(priority = 'page') {
  return new Promise((resolve) => {
    waiting[priority].push(resolve);
    release();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A picture from words alone, for the character bible. Returns { mime, data, cost }.
export async function generateFromText(prompt, size = '1024x1024') {
  await imageTurn();
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, size, quality: QUALITY, output_format: 'jpeg', output_compression: 90 }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `OpenAI returned HTTP ${r.status}`);
  return { mime: 'image/jpeg', data: Buffer.from(body.data[0].b64_json, 'base64'), cost: imageCost(MODEL, body.usage) };
}

// images: [{ mime, data: Buffer }]. Returns { mime, data, cost }.
export async function generateImage(prompt, images, size = '1536x1024', priority = 'page') {
  await imageTurn(priority);
  if (MOCK) {
    await sleep(800 + Math.random() * 1500);
    return { ...images[0], cost: 0 };
  }
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', QUALITY);
  form.append('output_format', 'jpeg');
  form.append('output_compression', '90');
  if (MODEL === 'gpt-image-1.5') form.append('input_fidelity', FIDELITY);
  images.forEach((img, i) => {
    form.append('image[]', new Blob([img.data], { type: img.mime }), `ref${i}.${img.mime.split('/')[1]}`);
  });
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `OpenAI returned HTTP ${r.status}`);
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('The model did not return an image.');
  return { mime: 'image/jpeg', data: Buffer.from(b64, 'base64'), cost: imageCost(MODEL, body.usage) };
}

const small = async (img, width) => `data:image/jpeg;base64,${(await sharp(img.data).resize({ width, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString('base64')}`;

// Vision check of one image. Returns { result, cost }, where result is the model's JSON.
export async function analyzeImage(prompt, images) {
  if (MOCK) {
    await sleep(200 + Math.random() * 400);
    const fail = Math.random() < MOCK_FAIL_RATE;
    return {
      cost: 0,
      result: {
        hero_visible: true, likeness: fail ? 4 : 8, scene_match: 8, defects: fail ? ['mock defect'] : [],
        important: [{ label: 'hero face', x: 0.42, y: 0.3, w: 0.16, h: 0.22 }],
      },
    };
  }
  const content = [{ type: 'text', text: prompt }];
  for (const img of images) content.push({ type: 'image_url', image_url: { url: await small(img, 1024), detail: 'high' } });
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ANALYSIS_MODEL, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `OpenAI returned HTTP ${r.status}`);
  return { result: JSON.parse(body.choices[0].message.content), cost: chatCost(ANALYSIS_MODEL, body.usage) };
}

export const thumbnail = async (data) => sharp(data).resize({ width: 360 }).jpeg({ quality: 78 }).toBuffer();
