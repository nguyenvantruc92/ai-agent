import { sql } from '@/db/client';
import { getDefaultAgent } from '@/features/ai/agents';

/**
 * Staging step before `eval:rag`/`eval:agent`: waits until the worker has indexed every seeded document, then fails
 * loudly if a document is not usable (failed, or held for safety review), so a red eval means a model regression and
 * not an empty knowledge base. Usage: `pnpm eval:ready [timeoutSeconds]` (default 600).
 */
const timeoutMs = Number(process.argv[2] ?? 600) * 1_000;
const deadline = Date.now() + timeoutMs;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await getDefaultAgent();
  for (;;) {
    const [{ open }] = await sql<{ open: number }[]>`SELECT count(*)::int AS open FROM ingestion_jobs WHERE status IN ('pending', 'processing')`;
    if (open === 0) break;
    if (Date.now() > deadline) throw new Error(`${open} ingestion job(s) still open after ${timeoutMs / 1_000}s; is the worker running with an OpenAI key?`);
    console.log(`waiting for ${open} ingestion job(s)…`);
    await wait(5_000);
  }
  const documents = await sql<{ title: string; status: string }[]>`SELECT original_filename AS title, status FROM knowledge_documents WHERE deleted_at IS NULL ORDER BY original_filename`;
  const unusable = documents.filter((doc) => doc.status !== 'ready');
  if (!documents.length) throw new Error('No knowledge documents: run `pnpm db:seed` first.');
  if (unusable.length) throw new Error(`Documents not ready: ${unusable.map((doc) => `${doc.title} (${doc.status})`).join(', ')}`);
  console.log(`ready: ${documents.length} document(s) indexed, default agent present`);
}

main()
  .then(() => sql.end())
  .catch(async (error) => { console.error(error instanceof Error ? error.message : error); await sql.end(); process.exit(1); });
