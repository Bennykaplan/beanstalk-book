import path from 'node:path';
import pg from 'pg';

// Every statement is safe to run again, so the schema is brought up to date on each start.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  about JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE books ADD COLUMN IF NOT EXISTS story TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS ready_ms INTEGER;
CREATE INDEX IF NOT EXISTS books_user ON books(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS images (
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  status TEXT NOT NULL,
  mime TEXT,
  data BYTEA,
  error TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, slot)
);
ALTER TABLE images ADD COLUMN IF NOT EXISTS thumb BYTEA;
ALTER TABLE images ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE images ADD COLUMN IF NOT EXISTS score REAL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS passed BOOLEAN;
ALTER TABLE images ADD COLUMN IF NOT EXISTS analysis JSONB;
ALTER TABLE images ADD COLUMN IF NOT EXISTS layout JSONB;
CREATE TABLE IF NOT EXISTS generation_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  book_id UUID,
  slot TEXT,
  action TEXT,
  model TEXT,
  quality TEXT,
  ms INTEGER,
  ok BOOLEAN,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE generation_log ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS generation_log_time ON generation_log(created_at);
CREATE INDEX IF NOT EXISTS generation_log_book ON generation_log(book_id);

-- The character bible: one reference image per character. Story-wide characters have no book;
-- each book's own hero (the uploaded child) is stored against that book.
CREATE TABLE IF NOT EXISTS bible (
  story TEXT NOT NULL,
  key TEXT NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bible_key ON bible(story, key, COALESCE(book_id, '00000000-0000-0000-0000-000000000000'));

-- Pre-generated scenes for every page of both stories, with the stand-in hero.
CREATE TABLE IF NOT EXISTS scenes (
  story TEXT NOT NULL,
  page INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  analysis JSONB,
  PRIMARY KEY (story, page)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Money. Every credit and debit, and what caused it. Balance = sum of completed amounts.
CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  book_id UUID,
  order_id INTEGER,
  stripe_ref TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_stripe ON ledger(kind, stripe_ref) WHERE stripe_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at DESC);

-- Print orders.
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  proof_viewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  address JSONB,
  shipping_level TEXT,
  quote JSONB,
  price_cents INTEGER,
  lulu_id TEXT,
  lulu_status TEXT,
  base_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let client;

// Postgres in production. Local runs without DATABASE_URL use PGlite (Postgres in a folder),
// which is a dev dependency. On Render a missing DATABASE_URL must fail loudly: anything
// written to the local disk there vanishes on the next restart.
export async function initDb(dir) {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Render's internal URLs have no domain and no TLS; its external ones require TLS.
    const ssl = /\.render\.com/.test(url) ? { rejectUnauthorized: false } : undefined;
    client = new pg.Pool({ connectionString: url, ssl, max: 10 });
    await client.query(SCHEMA);
  } else {
    if (process.env.RENDER) throw new Error('DATABASE_URL is not set.');
    const { PGlite } = await import('@electric-sql/pglite');
    client = new PGlite(path.join(dir, process.env.PGLITE_DIR || '.localdb'));
    await client.exec(SCHEMA);
  }
}

export const query = (sql, params) => client.query(sql, params);
export const toBuffer = (bytes) => (bytes == null ? null : Buffer.from(bytes));
