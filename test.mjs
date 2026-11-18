// End-to-end check against a running local server with DEV_LOGIN=1 and IMAGE_PROVIDER=mock
// (no image or AI costs; Stripe calls are real but in test mode). Usage: node test.mjs <photo>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.loadEnvFile('.env');
const base = process.env.BASE || `http://localhost:${process.env.PORT || 3020}`;
const photoPath = process.argv[2];
const ext = path.extname(photoPath).slice(1).replace('jpg', 'jpeg');
const photo = `data:image/${ext};base64,${fs.readFileSync(photoPath).toString('base64')}`;

async function client(who) {
  const r = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who }) });
  assert.equal(r.status, 200, 'dev login');
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = (url, method = 'GET', body) => fetch(base + url, {
    method, headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
  });
  call.json = async (url, method, body) => {
    const res = await call(url, method, body);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return call;
}

// A real test-mode card payment made straight against Stripe's API, so refunds can be tested.
async function stripePayment(cents) {
  const r = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ amount: String(cents), currency: 'usd', payment_method: 'pm_card_visa', confirm: 'true', 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never', 'metadata[app]': 'beanstalk-storybook-test' }),
  });
  const pi = await r.json();
  assert.equal(pi.status, 'succeeded', 'test payment');
  return pi.id;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const balance = async (api) => (await api.json('/api/wallet')).body.balanceCents;

assert.equal((await fetch(`${base}/api/books`)).status, 401, 'signed-out users are refused');
const alice = await client(`alice-${Date.now()}`);
const bob = await client(`bob-${Date.now()}`);

// Wallet: no money, no book.
let r = await alice.json('/api/books', 'POST', { story: 'jack', photo, about: { name: 'Alice', age: '7' } });
assert.equal(r.status, 402, 'a book needs money in the wallet');

// About Me checks: insults and fake names are refused, field by field.
for (const [about, field] of [[{ name: 'Stupid' }, 'name'], [{ name: 'xX_d00m_Xx' }, 'name'], [{ name: 'Sam', bio: 'He is a moron' }, 'bio'], [{ name: 'Sam', age: 'old' }, 'age']]) {
  r = await alice.json('/api/checks/about', 'POST', { about });
  assert.equal(r.status, 400, `refused ${JSON.stringify(about)}`);
  assert.equal(r.body.field, field);
}
r = await alice.json('/api/checks/about', 'POST', { about: { name: 'mary ann', age: '7', favorites: 'cows' } });
assert.equal(r.status, 200, 'a real name passes');
assert.equal(r.body.about.name, 'Mary Ann', 'names are capitalized');

// Fund the wallet with a real test-mode payment.
const pi = await stripePayment(500);
r = await alice.json('/auth/dev/deposit', 'POST', { cents: 500, paymentIntent: pi });
const depositId = r.body.id;
assert.equal(await balance(alice), 500);

// A book: $0.99, all 20 pages in parallel, each checked.
const start = Date.now();
r = await alice.json('/api/books', 'POST', { story: 'jack', photo, about: { name: 'alice', age: '7', favorites: 'Climbing trees', bio: 'Alice loves giants.' } });
assert.equal(r.status, 200, `book created: ${r.body.error || ''}`);
const id = r.body.id;
assert.equal(await balance(alice), 401, '$0.99 charged');
let book;
let mostBusy = 0;
for (;;) {
  book = (await alice.json(`/api/books/${id}`)).body;
  mostBusy = Math.max(mostBusy, Object.values(book.slots).filter((s) => ['painting', 'checking', 'retrying'].includes(s.status)).length);
  if (['ready', 'partial', 'failed'].includes(book.stage)) break;
  await sleep(300);
}
console.log(`book ${book.stage} in ${Date.now() - start} ms, up to ${mostBusy} pages at once`);
assert.equal(book.stage, 'ready');
assert.ok(mostBusy >= 10, 'pages run in parallel');
const tries = Object.entries(book.slots).filter(([s]) => s.startsWith('p')).map(([, s]) => s.attempts);
console.log('tries per page:', tries.join(' '));
assert.ok(tries.every((t) => t >= 1 && t <= 3), 'at most 3 tries per page');
const pageSlots = Object.entries(book.slots).filter(([s]) => s.startsWith('p')).map(([, s]) => s);
assert.ok(pageSlots.every((s) => s.layout && ['band', 'panel'].includes(s.layout.mode)), 'every page has a text layout');
console.log('layouts:', pageSlots.map((s) => (s.layout.mode === 'band' ? s.layout.zone : 'panel')).join(' '));

assert.equal((await bob(`/api/books/${id}`)).status, 404, "another user can't read the book");
assert.equal((await bob(`/api/books/${id}/pdf`)).status, 404, "another user can't download the PDF");
assert.equal((await bob(`/api/books/${id}/thumbs/p01`)).status, 404, "another user can't see thumbnails");

const pdf = await alice(`/api/books/${id}/pdf`);
assert.equal(pdf.status, 200, 'PDF builds');
const bytes = Buffer.from(await pdf.arrayBuffer());
assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync('test-output/test-book.pdf', bytes);

// Print order: nothing can be ordered before the proof is opened and approved.
r = await alice.json(`/api/books/${id}/orders`, 'POST');
const orderId = r.body.id;
assert.equal((await alice.json(`/api/orders/${orderId}/approve`, 'POST')).status, 409, "can't approve an unopened proof");
assert.equal((await alice.json(`/api/orders/${orderId}/place`, 'POST')).status, 409, "can't place an unapproved order");
assert.equal((await bob(`/api/orders/${orderId}/proof.pdf`)).status, 404, "another user can't see the proof");
assert.equal((await alice(`/api/orders/${orderId}/proof.pdf`)).status, 200, 'proof opens');
assert.equal((await alice.json(`/api/orders/${orderId}/approve`, 'POST')).status, 200, 'approve after opening');
r = await alice.json(`/api/orders/${orderId}/quote`, 'POST', { address: { name: 'Alice Test', street1: '1 Main St', city: 'Springfield', state_code: 'XX', postcode: '12345', phone_number: '555 123 4567', email: 'a@example.com' } });
assert.equal(r.status, 400, 'bad state refused');
assert.equal(r.body.field, 'state_code');

// Refund part of the deposit back to the card, for real in Stripe test mode.
r = await alice.json('/api/wallet/refund', 'POST', { depositId, cents: 200 });
assert.equal(r.status, 200, `refund: ${r.body.error || ''}`);
assert.equal(await balance(alice), 201, 'refund leaves the wallet');
const hist = (await alice.json('/api/wallet')).body.history.map((h) => `${h.kind}:${h.status}:${h.amount_cents}`);
console.log('history:', hist.join(', '));
assert.ok(hist.includes('refund_request:completed:0') && hist.includes('refund:completed:-200'), 'request and processing both recorded');
assert.equal((await bob.json('/api/wallet/refund', 'POST', { depositId, cents: 100 })).status, 404, "another user can't refund my payment");

console.log('all checks passed');
