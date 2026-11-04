import { applyMigrations } from '@/db/apply-migrations';
import { sql } from '@/db/client';
import { ensureAiDefaults } from '@/features/ai/seed';
import { createCheckpointer, createStore } from '@/features/agent/runtime';
import { seedCatalogIfEmpty } from '@/features/catalog/import';
import { resetSeedOrders } from '@/features/orders/repository';

async function main() {
  // Both `web` and `worker` invoke this script at startup. The lock makes initial
  // boot deterministic instead of racing on CREATE TABLE IF NOT EXISTS.
  await sql`SELECT pg_advisory_lock(7242001)`;
  try {
    await applyMigrations(console.log);
    await ensureAiDefaults();

    // LangGraph checkpoint/store tables live in their own `langgraph` schema.
    const checkpointer = createCheckpointer();
    const store = createStore();
    await checkpointer.setup();
    await store.setup();
    await Promise.all([checkpointer.end(), store.stop()]);

    try {
      const catalog = await seedCatalogIfEmpty();
      if (catalog) console.log(`Imported ${catalog.products} demo products in ${catalog.categories} categories`);
    } catch (error) {
      console.error(`Could not import the demo catalog: ${error instanceof Error ? error.message : error}`);
    }

    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM orders`;
    if (count === 0) console.log(`Seeded ${await resetSeedOrders()} demo orders`);
  } finally {
    await sql`SELECT pg_advisory_unlock(7242001)`;
    await sql.end();
  }
}

void main();
