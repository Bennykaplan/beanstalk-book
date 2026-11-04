import path from 'node:path';
import pg from 'pg';

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
CREATE INDEX IF NOT EXISTS generation_log_time ON generation_log(created_at);
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
    client = new pg.Pool({ connectionString: url, ssl, max: 5 });
    await client.query(SCHEMA);
  } else {
    if (process.env.RENDER) throw new Error('DATABASE_URL is not set.');
    const { PGlite } = await import('@electric-sql/pglite');
    client = new PGlite(path.join(dir, process.env.PGLITE_DIR || '.localdb'));
    await client.exec(SCHEMA);
  }
}

export const query = (sql, params) => client.query(sql, params);
export const toBuffer = (bytes) => Buffer.from(bytes);
