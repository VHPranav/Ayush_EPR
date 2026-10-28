import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export async function runMigrations(pool, directory = new URL('./migrations/', import.meta.url)) {
  const client = await pool.connect();
  try {
    // Serialize startup upgrades when more than one API process starts together.
    await client.query('SELECT pg_advisory_lock(728411039)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const names = (await fs.readdir(directory)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
    const applied = new Map((await client.query('SELECT name,checksum FROM schema_migrations')).rows.map(r => [r.name, r.checksum]));
    for (const name of applied.keys()) if (!names.includes(name)) throw new Error(`Applied migration missing from this release: ${name}`);
    for (const name of names) {
      const sql = await fs.readFile(new URL(name, directory), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(`Applied database migration: ${name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(728411039)').catch(() => {});
    client.release();
  }
}
