// End-to-end check against a running local server with DEV_LOGIN=1 and IMAGE_PROVIDER=mock
// (costs nothing). Usage: node test.mjs <photo>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE || `http://localhost:${process.env.PORT || 3020}`;
const photoPath = process.argv[2];
const ext = path.extname(photoPath).slice(1).replace('jpg', 'jpeg');
const photo = `data:image/${ext};base64,${fs.readFileSync(photoPath).toString('base64')}`;

async function client(who) {
  const r = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who }) });
  assert.equal(r.status, 200, 'dev login');
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (url, method = 'GET', body) => fetch(base + url, {
    method,
    headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilSettled(api, id) {
  let most = 0;
  for (;;) {
    const book = await (await api(`/api/books/${id}`)).json();
    const states = Object.values(book.slots).map((s) => s.status);
    most = Math.max(most, states.filter((s) => s === 'generating').length);
    if (!states.some((s) => s === 'queued' || s === 'generating')) return { book, most };
    await sleep(200);
  }
}

assert.equal((await fetch(`${base}/api/books`)).status, 401, 'signed-out users are refused');

const alice = await client('alice');
const bob = await client('bob');

const start = Date.now();
const created = await alice('/api/books', 'POST', { photo, about: { name: 'Alice', age: '7' } });
assert.equal(created.status, 200, 'book created');
const { id } = await created.json();
const { book, most } = await waitUntilSettled(alice, id);
console.log(`book finished in ${Date.now() - start} ms, up to ${most} images at once`);
console.log('slots:', Object.fromEntries(Object.entries(book.slots).map(([k, v]) => [k, v.status])));
assert.ok(most >= 2, 'pages run in parallel');

assert.equal((await bob(`/api/books/${id}`)).status, 404, "another user can't read the book");
assert.equal((await bob(`/api/books/${id}/pdf`)).status, 404, "another user can't download the PDF");
assert.equal((await bob(`/api/books/${id}/images/character`)).status, 404, "another user can't read images");
assert.equal((await bob(`/api/books/${id}`, 'DELETE')).status, 404, "another user can't delete it");
assert.equal((await (await bob('/api/books')).json()).some((b) => b.id === id), false, "it isn't on another user's shelf");

const failed = Object.entries(book.slots).filter(([, s]) => s.status === 'error').map(([k]) => k);
await Promise.all(failed.map(async (slot) => {
  assert.equal((await alice(`/api/books/${id}/slots/${slot}/remake`, 'POST', {})).status, 200, 'retry accepted');
}));
if (failed.length) console.log('retried:', failed);
const after = (await waitUntilSettled(alice, id)).book;
assert.ok(Object.values(after.slots).every((s) => s.status === 'done'), 'everything finished');

assert.equal((await alice(`/api/books/${id}/slots/trade/edit`, 'POST', { instruction: 'make the cow brown' })).status, 200, 'edit accepted');
await waitUntilSettled(alice, id);

const pdf = await alice(`/api/books/${id}/pdf`);
assert.equal(pdf.status, 200, 'PDF builds');
assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

if (process.env.KEEP_BOOK) {
  console.log('kept book', id);
} else {
  assert.equal((await alice(`/api/books/${id}`, 'DELETE')).status, 200, 'delete');
  assert.equal((await alice(`/api/books/${id}`)).status, 404, 'deleted books are gone');
}
console.log('all checks passed');
