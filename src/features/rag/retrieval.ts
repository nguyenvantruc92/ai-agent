import { embed } from 'ai';
import { sql, type DbChunk } from '@/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { openai } from '@/lib/openai';
import { detectCategory, detectPolicyTopics, detectStockStatus, isBroadCatalogQuestion } from '@/features/rag/keywords';
import type { PreviousSource } from '@/features/rag/query';

type QueryTrace = { name: string; thresholded: boolean; results: { id: string; score: number }[] };
export type RetrievalResult = { traceId: string; chunks: DbChunk[]; queries: QueryTrace[] };

const vectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

function search(literal: string, filter: ReturnType<typeof sql>) {
  return sql<DbChunk[]>`
    SELECT c.id, c.source_id, c.source_type, c.title, c.content, c.metadata,
      1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.active_version_id = c.document_version_id AND d.deleted_at IS NULL
    WHERE true ${filter}
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${env.RETRIEVAL_TOP_K}
  `;
}

/**
 * `query` is what gets embedded (may carry follow-up context); keyword and
 * category detection only look at the user's current `message`.
 */
export async function retrieve(input: { query: string; message: string; traceId: string; policyOnly?: boolean }): Promise<RetrievalResult> {
  const startedAt = Date.now();
  const { embedding, usage } = await embed({
    model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
    value: input.query,
    maxRetries: env.OPENAI_MAX_RETRIES,
    abortSignal: AbortSignal.timeout(env.OPENAI_TIMEOUT_MS),
  });
  const literal = vectorLiteral(embedding);
  const topics = detectPolicyTopics(input.message);
  const category = detectCategory(input.message);

  const stockStatus = input.policyOnly ? undefined : detectStockStatus(input.message);
  const runs: { name: string; thresholded: boolean; rows: Promise<DbChunk[]> }[] = input.policyOnly
    ? [{ name: 'policy-only', thresholded: true, rows: search(literal, sql`AND c.source_type = 'policy'`) }]
    : [{ name: 'semantic', thresholded: true, rows: search(literal, sql``) }];
  // Placed first so the round-robin merge gives the stock filter priority over loose semantic hits.
  if (stockStatus) runs.unshift({ name: `stock:${stockStatus}`, thresholded: false, rows: search(literal, sql`AND c.source_type = 'product' AND c.metadata->>'stock_status' = ${stockStatus}`) });
  if (!input.policyOnly && topics.length) runs.push({ name: `policy:${topics.join(',')}`, thresholded: true, rows: search(literal, sql`AND c.source_type = 'policy'`) });
  // Category and overview searches are ranked by real similarity but exempt from the threshold.
  if (!input.policyOnly && category) runs.push({ name: `category:${category}`, thresholded: false, rows: search(literal, sql`AND c.source_type = 'product' AND c.metadata->>'category' = ${category}`) });
  if (!input.policyOnly && isBroadCatalogQuestion(input.message)) runs.push({ name: 'catalog-overview', thresholded: false, rows: search(literal, sql`AND c.source_type = 'policy' AND c.content ILIKE '%thời trang nam%'`) });

  const results = await Promise.all(runs.map(async (run) => ({ ...run, rows: await run.rows })));
  // Round-robin by rank across queries (thresholded ones first) so every intent of a
  // multi-part question keeps its best chunk instead of one topic filling the context.
  const ranked = results.map((run) => run.rows
    .slice(0, run.name === 'catalog-overview' ? 1 : undefined)
    .filter((chunk) => !run.thresholded || chunk.similarity >= env.RETRIEVAL_MIN_SIMILARITY));
  const selected = new Map<string, DbChunk>();
  for (let rank = 0; selected.size < env.MAX_CONTEXT_CHUNKS && ranked.some((rows) => rank < rows.length); rank += 1) {
    for (const rows of ranked) {
      const chunk = rows[rank];
      if (chunk && !selected.has(chunk.source_id) && selected.size < env.MAX_CONTEXT_CHUNKS) selected.set(chunk.source_id, chunk);
    }
  }
  const chunks = [...selected.values()].sort((a, b) => b.similarity - a.similarity);
  const queries = results.map((run) => ({ name: run.name, thresholded: run.thresholded, results: run.rows.map((chunk) => ({ id: chunk.source_id, score: Number(chunk.similarity.toFixed(4)) })) }));

  logger.info({
    trace_id: input.traceId,
    stage: 'retrieval',
    latencyMs: Date.now() - startedAt,
    followUpContext: input.query !== input.message,
    embeddingTokens: usage.tokens,
    queries,
    sourceIds: chunks.map((chunk) => chunk.source_id),
    scores: chunks.map((chunk) => Number(chunk.similarity.toFixed(4))),
  });
  return { traceId: input.traceId, chunks, queries };
}

/** Titles of previously cited sources, used to expand follow-up questions. */
export async function sourceTitles(sourceIds: string[]): Promise<PreviousSource[]> {
  if (!sourceIds.length) return [];
  const rows = await sql<{ source_id: string; title: string }[]>`
    SELECT DISTINCT ON (c.source_id) c.source_id, c.title
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.active_version_id = c.document_version_id AND d.deleted_at IS NULL
    WHERE c.source_id IN ${sql(sourceIds)}
  `;
  return rows.map((row) => ({ id: row.source_id, title: row.title }));
}
