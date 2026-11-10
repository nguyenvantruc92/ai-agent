import { embed } from 'ai';
import { sql, type DbChunk } from '@/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { metrics, safely } from '@/lib/metrics';
import { openai } from '@/lib/openai';
import { breakerFor } from '@/lib/resilience';
import { trackDependency } from '@/lib/telemetry';
import { activeCategoryNames } from '@/features/catalog/category-names';
import { detectCategory, detectPolicyTopics, detectStockStatus, isBroadCatalogQuestion } from '@/features/rag/keywords';

type QueryTrace = { name: string; thresholded: boolean; results: { id: string; score: number }[] };
export type RetrievalResult = { traceId: string; chunks: DbChunk[]; queries: QueryTrace[]; filters: { expired: number; future: number; conflicts: string[] } };

const vectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

/**
 * Every query embedding goes through the `openai:embedding` breaker and is recorded as a dependency call. With the
 * breaker open (enforce) it throws CircuitOpenError at once: search_products falls back to keyword search and a
 * knowledge-scope tool reports a tool error to the model instead of waiting for a timeout.
 */
function embedGuarded(value: string, traceId: string, timeoutMs: number) {
  return breakerFor('openai:embedding').run(() => trackDependency('openai', 'embedding', traceId, () =>
    embed({ model: openai.embedding(env.OPENAI_EMBEDDING_MODEL), value, maxRetries: env.OPENAI_MAX_RETRIES, abortSignal: AbortSignal.timeout(timeoutMs) })));
}

/** Embeds a short query with the configured embedding model (same settings as retrieval). */
export async function embedQuery(value: string, timeoutMs: number = env.OPENAI_TIMEOUT_MS, traceId = 'untraced') {
  const { embedding, usage } = await embedGuarded(value, traceId, timeoutMs);
  return { embedding, literal: vectorLiteral(embedding), tokens: usage.tokens };
}

function search(literal: string, filter: ReturnType<typeof sql>) {
  return sql<DbChunk[]>`
    SELECT c.id, c.source_id, c.source_type, c.title, c.content, c.metadata,
      1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.active_version_id = c.document_version_id AND d.deleted_at IS NULL
    JOIN knowledge_document_versions v ON v.id = c.document_version_id AND v.safety_status = 'approved'
    WHERE true ${filter}
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${env.RETRIEVAL_TOP_K}
  `;
}

type PolicyFilters = { expired: number; future: number; conflicts: string[] };
const asDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/** Never let two equally-current policy documents with the same key compete in prompt context. */
export function filterPolicyLifecycle(chunks: DbChunk[], enabled: boolean) {
  const filters: PolicyFilters = { expired: 0, future: 0, conflicts: [] };
  if (!enabled) return { allowed: new Set(chunks.map((chunk) => chunk.id)), filters };
  const today = new Date().toISOString().slice(0, 10);
  const viable = chunks.filter((chunk) => {
    if (chunk.source_type !== 'policy') return true;
    const from = asDate(chunk.metadata.effective_from);
    const to = asDate(chunk.metadata.effective_to);
    if (from && from > today) { filters.future += 1; return false; }
    if (to && to < today) { filters.expired += 1; return false; }
    return true;
  });
  const allowed = new Set(viable.map((chunk) => chunk.id));
  const byKey = new Map<string, DbChunk[]>();
  for (const chunk of viable) {
    const key = chunk.source_type === 'policy' && typeof chunk.metadata.policy_key === 'string' ? chunk.metadata.policy_key : null;
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), chunk]);
  }
  for (const [key, group] of byKey) {
    const docs = new Map<string, DbChunk[]>();
    for (const chunk of group) {
      const documentId = typeof chunk.metadata.document_id === 'string' ? chunk.metadata.document_id : chunk.source_id;
      docs.set(documentId, [...(docs.get(documentId) ?? []), chunk]);
    }
    if (docs.size < 2) continue;
    const entries = [...docs.entries()].map(([documentId, rows]) => {
      const from = asDate(rows[0].metadata.effective_from) ?? '0000-00-00';
      return { documentId, rows, from, supersedes: typeof rows[0].metadata.supersedes_document_id === 'string' ? rows[0].metadata.supersedes_document_id : null };
    });
    const newest = entries.reduce((value, item) => item.from > value ? item.from : value, '0000-00-00');
    let winners = entries.filter((item) => item.from === newest);
    const superseding = winners.filter((item) => item.supersedes && entries.some((candidate) => candidate.documentId === item.supersedes));
    if (superseding.length === 1) winners = superseding;
    if (winners.length !== 1) {
      filters.conflicts.push(key);
      for (const item of entries) for (const row of item.rows) allowed.delete(row.id);
      continue;
    }
    for (const item of entries) if (item.documentId !== winners[0].documentId) for (const row of item.rows) allowed.delete(row.id);
  }
  return { allowed, filters };
}

export type RetrievalScope = {
  documentIds: string[];
  /** Also search the shipping-policy chunk the system generates from Cài đặt (stored in the catalog document). */
  includeSystemPolicy?: boolean;
};

/** Documents (and optionally the generated shipping chunk) a knowledge scope may search. */
function scopeFilter(scope: RetrievalScope): ReturnType<typeof sql> {
  const ids = sql.array(scope.documentIds, 2950);
  return scope.includeSystemPolicy
    ? sql`AND (d.id = ANY(${ids}::uuid[]) OR (d.storage_key = 'db:catalog' AND c.source_type = 'policy'))`
    : sql`AND d.id = ANY(${ids}::uuid[])`;
}

/**
 * `query` is what gets embedded (may carry follow-up context); keyword and
 * category detection only look at the user's current `message`.
 * With `scope`, only that scope's documents are searched (one semantic run) — used by knowledge-scope tools.
 */
export async function retrieve(input: { query: string; message: string; traceId: string; scope?: RetrievalScope }): Promise<RetrievalResult> {
  const startedAt = Date.now();
  if (input.scope && !input.scope.documentIds.length && !input.scope.includeSystemPolicy) return { traceId: input.traceId, chunks: [], queries: [], filters: { expired: 0, future: 0, conflicts: [] } };
  const scoped = Boolean(input.scope);
  // Category names are only needed for the unscoped search, so scope tools never touch the categories table.
  const [{ embedding, usage }, categories] = await Promise.all([
    embedGuarded(input.query, input.traceId, env.OPENAI_TIMEOUT_MS),
    scoped ? [] : activeCategoryNames(),
  ]);
  const literal = vectorLiteral(embedding);
  const topics = detectPolicyTopics(input.message);
  const category = detectCategory(input.message, categories);

  const stockStatus = scoped ? undefined : detectStockStatus(input.message);
  const runs: { name: string; thresholded: boolean; rows: Promise<DbChunk[]> }[] = input.scope
    ? [{ name: 'scope', thresholded: true, rows: search(literal, scopeFilter(input.scope)) }]
    : [{ name: 'semantic', thresholded: true, rows: search(literal, sql``) }];
  // Placed first so the round-robin merge gives the stock filter priority over loose semantic hits.
  if (stockStatus) runs.unshift({ name: `stock:${stockStatus}`, thresholded: false, rows: search(literal, sql`AND c.source_type = 'product' AND c.metadata->>'stock_status' = ${stockStatus}`) });
  if (!scoped && topics.length) runs.push({ name: `policy:${topics.join(',')}`, thresholded: true, rows: search(literal, sql`AND c.source_type = 'policy'`) });
  // Category and overview searches are ranked by real similarity but exempt from the threshold.
  if (!scoped && category) runs.push({ name: `category:${category}`, thresholded: false, rows: search(literal, sql`AND c.source_type = 'product' AND c.metadata->>'category' = ${category}`) });
  if (!scoped && isBroadCatalogQuestion(input.message)) runs.push({ name: 'catalog-overview', thresholded: false, rows: search(literal, sql`AND c.source_type = 'policy' AND c.content ILIKE '%thời trang nam%'`) });

  const results = await Promise.all(runs.map(async (run) => ({ ...run, rows: await run.rows })));
  // Round-robin by rank across queries (thresholded ones first) so every intent of a
  // multi-part question keeps its best chunk instead of one topic filling the context.
  const ranked = results.map((run) => run.rows
    .slice(0, run.name === 'catalog-overview' ? 1 : undefined)
    .filter((chunk) => !run.thresholded || chunk.similarity >= env.RETRIEVAL_MIN_SIMILARITY));
  const lifecycle = filterPolicyLifecycle(ranked.flat(), env.RAG_POLICY_LIFECYCLE_ENABLED);
  for (const rows of ranked) {
    for (let index = rows.length - 1; index >= 0; index -= 1) if (!lifecycle.allowed.has(rows[index].id)) rows.splice(index, 1);
  }
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
    lifecycleFilters: lifecycle.filters,
  });
  safely(() => {
    metrics.retrieval.observe((Date.now() - startedAt) / 1_000);
    if (!chunks.length) metrics.retrievalEmpty.inc();
    metrics.tokens.inc({ kind: 'embedding' }, usage.tokens);
  });
  return { traceId: input.traceId, chunks, queries, filters: lifecycle.filters };
}
