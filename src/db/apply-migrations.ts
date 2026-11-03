import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '@/db/client';

/**
 * Applies every pending file in src/db/migrations, in name order, in one transaction.
 * A transaction-level advisory lock makes concurrent callers (two containers, or two test files)
 * queue up instead of racing on `schema_migrations`.
 */
export async function applyMigrations(log: (message: string) => void = () => undefined) {
  const dir = join(process.cwd(), 'src', 'db', 'migrations');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7242003)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const name of files) {
      const [row] = await tx<{ name: string }[]>`SELECT name FROM schema_migrations WHERE name = ${name}`;
      if (row) continue;
      await tx.unsafe(await readFile(join(dir, name), 'utf8'));
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      log(`Applied ${name}`);
    }
  });
}
