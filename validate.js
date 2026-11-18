// Checks what the uploader types before it can be printed: the About Me details must be
// appropriate, and the name must be a real-sounding name, not an insult or an epithet.
import { MOCK } from './images.js';

const NAME_SHAPE = /^[\p{L}][\p{L}'’ -]{0,28}[\p{L}]$|^[\p{L}]$/u;

// Fast local refusals, before any API call. Deliberately short: the moderation API and the
// name check below catch far more than a word list can.
const OBVIOUS = /\b(stupid|idiot|dumb|ugly|fat|loser|moron|poop|butt|fart|sucks?)\b/i;

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

async function moderate(texts) {
  if (MOCK) return texts.map((t) => OBVIOUS.test(t));
  const r = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: texts }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || 'Moderation check failed.');
  return body.results.map((x) => x.flagged);
}

async function isRealName(name) {
  if (MOCK) return { ok: !OBVIOUS.test(name), reason: 'That doesn’t look like a real name.' };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `A parent typed this as their child's name, to be printed on the cover of a children's book: "${name}"
Is it a plausible real first name (or first and last name, or a common nickname) from any culture? Reject insults, epithets, slurs, swear words, body parts, jokes, rude puns, brand or celebrity names used as jokes, and words that are not names.
Return JSON: {"ok": true or false, "reason": "a short, polite sentence for the parent if not ok"}`,
      }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || 'Name check failed.');
  return JSON.parse(body.choices[0].message.content);
}

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Returns the cleaned About Me, or throws a ValidationError naming the field.
export async function checkAbout(raw = {}) {
  const about = { name: clip(raw.name, 30), age: clip(raw.age, 3), favorites: clip(raw.favorites, 120), bio: clip(raw.bio, 300) };
  if (!about.name) throw new ValidationError('name', "Please type the child's name.");
  if (!NAME_SHAPE.test(about.name) || about.name.split(' ').length > 3) {
    throw new ValidationError('name', 'Please use letters only, like "Sam" or "Mary Ann".');
  }
  if (about.age && !(/^\d{1,2}$/.test(about.age) && Number(about.age) >= 1 && Number(about.age) <= 99)) {
    throw new ValidationError('age', 'Please type the age as a number, like 7.');
  }
  for (const field of ['name', 'favorites', 'bio']) {
    if (OBVIOUS.test(about[field])) throw new ValidationError(field, 'Please keep it kind: this will be printed in a children’s book.');
  }
  const fields = ['name', 'favorites', 'bio'].filter((f) => about[f]);
  const flagged = await moderate(fields.map((f) => about[f]));
  const bad = fields.find((_, i) => flagged[i]);
  if (bad) throw new ValidationError(bad, 'Please keep it kind: this will be printed in a children’s book.');
  const name = await isRealName(about.name);
  if (!name.ok) throw new ValidationError('name', name.reason || 'Please type a real name.');
  // Capitalize each part, so "sam" prints as "Sam" on the cover.
  about.name = about.name.split(' ').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  return about;
}

// Photos are checked too: nothing inappropriate goes to the image model or the printer.
export async function checkPhoto(photo) {
  if (MOCK) return;
  const r = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url: `data:${photo.mime};base64,${photo.data.toString('base64')}` } }] }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || 'Photo check failed.');
  if (body.results[0].flagged) throw new ValidationError('photo', 'Please choose a different photo: a clear, everyday photo of the child’s face.');
}
