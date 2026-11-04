// Turns a prompt and reference images into one picture.
// IMAGE_PROVIDER=mock returns the first reference image after a delay and costs nothing, for
// testing login, storage and progress. For a real but cheap run, use OPENAI_IMAGE_QUALITY=low.

export const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
export const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';
const MOCK = process.env.IMAGE_PROVIDER === 'mock';
const failOnce = new Set((process.env.MOCK_FAIL_ONCE || '').split(',').filter(Boolean));

// OpenAI allows only a few image calls a minute, so parallel work across all users is capped.
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL_IMAGES || 4);
let active = 0;
const waiting = [];

export async function withImageTurn(fn) {
  if (active >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

// images: [{ mime, data: Buffer }]. One request, no retries: a failed image shows up in the
// book with a Try again button, so a bad prompt can't quietly burn the balance.
export async function generateImage(prompt, images, slot) {
  if (MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 3000));
    if (failOnce.delete(slot)) throw new Error('Mock failure.');
    return images[0];
  }
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', prompt);
  form.append('size', '1536x1024');
  form.append('quality', QUALITY);
  form.append('output_format', 'jpeg');
  form.append('output_compression', '90');
  form.append('input_fidelity', process.env.OPENAI_INPUT_FIDELITY || 'high'); // keeps the reference face
  images.forEach((img, i) => {
    form.append('image[]', new Blob([img.data], { type: img.mime }), `ref${i}.${img.mime.split('/')[1]}`);
  });
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `OpenAI returned HTTP ${r.status}`);
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('The model did not return an image.');
  return { mime: 'image/jpeg', data: Buffer.from(b64, 'base64') };
}
