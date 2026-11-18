// The wallet: money in through Stripe Checkout (test mode), money out for each book and print
// order, and refunds back to the card. Every movement is a row in the ledger.
import Stripe from 'stripe';
import { query } from './db.js';
import { log } from './log.js';

export const BOOK_PRICE_CENTS = 99;
export const DEPOSIT_OPTIONS = [500, 1000, 2500, 5000];

let stripe;
const stripeClient = () => {
  stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

export class PaymentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function balanceCents(userId) {
  const { rows } = await query("SELECT COALESCE(sum(amount_cents), 0) AS cents FROM ledger WHERE user_id = $1 AND status = 'completed'", [userId]);
  return Number(rows[0].cents);
}

export async function history(userId) {
  const { rows } = await query(
    `SELECT id, amount_cents, kind, status, description, book_id, order_id, refunded_cents, created_at,
            stripe_ref IS NOT NULL AS from_stripe
     FROM ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows;
}

// Step 1 of adding money: a Stripe Checkout page. The app is credited only after Stripe confirms.
export async function startDeposit(userId, cents, baseUrl) {
  if (!DEPOSIT_OPTIONS.includes(cents)) throw new PaymentError(400, 'Choose one of the amounts shown.');
  const session = await stripeClient().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, product_data: { name: 'Beanstalk Storybook credit' } } }],
    metadata: { app: 'beanstalk-storybook', user_id: String(userId) },
    success_url: `${baseUrl}/#wallet?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#wallet`,
  });
  log('deposit_started', { user: userId, cents });
  return session.url;
}

// Step 2: back from Stripe. Check the session really was paid, by this user, once.
export async function confirmDeposit(userId, sessionId) {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId || '')) throw new PaymentError(400, 'Unknown payment.');
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.user_id !== String(userId) || session.metadata?.app !== 'beanstalk-storybook') throw new PaymentError(404, 'Unknown payment.');
  if (session.payment_status !== 'paid') return { credited: false };
  const { rowCount } = await query(
    `INSERT INTO ledger (user_id, amount_cents, kind, status, description, stripe_ref)
     VALUES ($1, $2, 'deposit', 'completed', 'Added money by card', $3)
     ON CONFLICT (kind, stripe_ref) WHERE stripe_ref IS NOT NULL DO NOTHING`,
    [userId, session.amount_total, session.payment_intent],
  );
  if (rowCount) log('deposit', { user: userId, cents: session.amount_total });
  return { credited: rowCount > 0 };
}

// Refund part or all of one card payment, up to what's left of it and of the balance.
// The request and the processing are separate ledger rows, so the history shows both.
export async function refund(userId, depositId, cents) {
  const { rows } = await query("SELECT * FROM ledger WHERE id = $1 AND user_id = $2 AND kind = 'deposit' AND status = 'completed'", [depositId, userId]);
  const deposit = rows[0];
  if (!deposit) throw new PaymentError(404, 'Payment not found.');
  const left = deposit.amount_cents - deposit.refunded_cents;
  const balance = await balanceCents(userId);
  const amount = Math.min(Math.floor(cents), left, balance);
  if (!(amount > 0)) throw new PaymentError(400, "There's nothing left to refund on that payment.");

  const { rows: [request] } = await query(
    `INSERT INTO ledger (user_id, amount_cents, kind, status, description)
     VALUES ($1, 0, 'refund_request', 'completed', $2) RETURNING id`,
    [userId, `Refund requested: $${(amount / 100).toFixed(2)} back to card`],
  );
  const { rows: [held] } = await query(
    `INSERT INTO ledger (user_id, amount_cents, kind, status, description) VALUES ($1, $2, 'refund', 'pending', 'Refund to card (processing)') RETURNING id`,
    [userId, -amount],
  );
  try {
    const r = await stripeClient().refunds.create({ payment_intent: deposit.stripe_ref, amount, metadata: { app: 'beanstalk-storybook', user_id: String(userId) } });
    await query("UPDATE ledger SET status = 'completed', stripe_ref = $1, description = 'Refund to card (processed)' WHERE id = $2", [r.id, held.id]);
    await query('UPDATE ledger SET refunded_cents = refunded_cents + $1 WHERE id = $2', [amount, deposit.id]);
    log('refund', { user: userId, cents: amount, request: request.id });
    return { refunded: amount };
  } catch (e) {
    await query("UPDATE ledger SET status = 'failed', description = $1 WHERE id = $2", [`Refund failed: ${e.message}`.slice(0, 200), held.id]);
    log('refund_failed', { user: userId, error: e.message });
    throw new PaymentError(502, "Stripe couldn't process that refund.");
  }
}

// A debit for a book or a print order. Fails, and charges nothing, if the balance is too low.
export async function charge(userId, cents, kind, description, refs = {}) {
  if ((await balanceCents(userId)) < cents) throw new PaymentError(402, `This costs $${(cents / 100).toFixed(2)}. Please add money to your wallet first.`);
  const { rows } = await query(
    `INSERT INTO ledger (user_id, amount_cents, kind, status, description, book_id, order_id)
     VALUES ($1, $2, $3, 'completed', $4, $5, $6) RETURNING id`,
    [userId, -cents, kind, description, refs.bookId ?? null, refs.orderId ?? null],
  );
  return rows[0].id;
}

// Gives back a charge whose work didn't happen (a book that failed entirely, a print order
// the printer refused).
export async function credit(userId, cents, description, refs = {}) {
  await query(
    `INSERT INTO ledger (user_id, amount_cents, kind, status, description, book_id, order_id)
     VALUES ($1, $2, 'credit', 'completed', $3, $4, $5)`,
    [userId, cents, description, refs.bookId ?? null, refs.orderId ?? null],
  );
}

// What a book really costs us: every API call logged against it, averaged over finished books.
export async function costStats() {
  const { rows } = await query(
    `SELECT count(*) AS books, COALESCE(avg(total), 0) AS avg, COALESCE(min(total), 0) AS min, COALESCE(max(total), 0) AS max FROM (
       SELECT b.id, sum(g.cost_usd) AS total FROM books b JOIN generation_log g ON g.book_id = b.id
       WHERE b.stage = 'ready' AND b.story IS NOT NULL GROUP BY b.id
     ) t`,
  );
  const r = rows[0];
  return { books: Number(r.books), avgUsd: Number(r.avg), minUsd: Number(r.min), maxUsd: Number(r.max) };
}

export async function bookCost(bookId) {
  const { rows } = await query(
    `SELECT COALESCE(sum(cost_usd), 0) AS total, count(*) FILTER (WHERE action LIKE 'image%') AS images,
            count(*) FILTER (WHERE action = 'check') AS checks
     FROM generation_log WHERE book_id = $1`,
    [bookId],
  );
  return { usd: Number(rows[0].total), images: Number(rows[0].images), checks: Number(rows[0].checks) };
}
