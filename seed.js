// Loads the pre-generated character bible and scenes (assets/, made by pregen.mjs) into the
// database, whenever assets/manifest.json is newer than what the database holds.
import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';
import { log } from './log.js';

export async function seedAssets(dir) {
  const manifestPath = path.join(dir, 'assets', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return log('seed', { skipped: 'no assets yet' });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { rows } = await query("SELECT value FROM meta WHERE key = 'assets_version'");
  if (rows[0]?.value === manifest.version) return;
  const read = (file) => fs.readFileSync(path.join(dir, 'assets', file));
  for (const [story, m] of Object.entries(manifest.stories)) {
    for (const [key, entry] of Object.entries(m.bible)) {
      await query(
        `INSERT INTO bible (story, key, book_id, description, mime, data) VALUES ($1, $2, NULL, $3, 'image/jpeg', $4)
         ON CONFLICT (story, key, COALESCE(book_id, '00000000-0000-0000-0000-000000000000')) DO UPDATE SET description = $3, data = $4, updated_at = now()`,
        [story, key, entry.description, read(entry.file)],
      );
    }
    for (const [page, entry] of Object.entries(m.scenes)) {
      await query(
        `INSERT INTO scenes (story, page, mime, data, analysis) VALUES ($1, $2, 'image/jpeg', $3, $4)
         ON CONFLICT (story, page) DO UPDATE SET data = $3, analysis = $4`,
        [story, Number(page), read(entry.file), JSON.stringify(entry.analysis ?? null)],
      );
    }
  }
  await query("INSERT INTO meta (key, value) VALUES ('assets_version', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [manifest.version]);
  log('seed', { version: manifest.version });
}
