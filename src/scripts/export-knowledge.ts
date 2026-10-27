import { sql } from '@/db/client';
import { exportKnowledgeSnapshot } from '@/features/knowledge/snapshot';

/** Writes the active knowledge versions (chunks, embeddings, source files) to data/seed for committing. */
async function main() {
  const { documents, chunks } = await exportKnowledgeSnapshot();
  console.log(`Exported ${documents} documents, ${chunks} chunks to data/seed`);
  await sql.end();
}

void main();
