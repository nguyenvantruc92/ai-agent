import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '@/db/client';
import { createCheckpointer, createStore } from '@/features/agent/runtime';
import { resetSeedOrders } from '@/features/orders/repository';

async function main() {
  // Both `web` and `worker` invoke this script at startup. The lock makes initial
  // boot deterministic instead of racing on CREATE TABLE IF NOT EXISTS.
  await sql`SELECT pg_advisory_lock(7242001)`;
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const dir = join(process.cwd(), 'src', 'db', 'migrations');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
    for (const name of files) {
      const [row] = await sql<{ name: string }[]>`SELECT name FROM schema_migrations WHERE name = ${name}`;
      if (row) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(await readFile(join(dir, name), 'utf8'));
        await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      });
      console.log(`Applied ${name}`);
    }

    // LangGraph checkpoint/store tables live in their own `langgraph` schema.
    const checkpointer = createCheckpointer();
    const store = createStore();
    await checkpointer.setup();
    await store.setup();
    await Promise.all([checkpointer.end(), store.stop()]);

    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM orders`;
    if (count === 0) console.log(`Seeded ${await resetSeedOrders()} demo orders`);
  } finally {
    await sql`SELECT pg_advisory_unlock(7242001)`;
    await sql.end();
  }
}

void main();
