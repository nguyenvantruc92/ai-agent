import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { embedMany } from 'ai';
import { sql } from '@/db/client';
import { env } from '@/lib/env';
import { uploadRoot } from '@/features/knowledge/files';
import { parseCatalog, parsePolicyTable, parsePolicyText } from '@/features/knowledge/parser';
import { extractPdf } from '@/features/knowledge/pdf';
import type { ParsedChunk } from '@/features/knowledge/types';
import { openai } from '@/lib/openai';
import { workerLogger } from '@/lib/logger';
import { cleanupAgentState, expireApprovals } from '@/worker/maintenance';

type Job = { id: string; document_id: string; document_version_id: string; version: number; storage_key: string; mime_type: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const vectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

async function claimJob(): Promise<Job | undefined> {
  return sql.begin(async (tx) => {
    const [job] = await tx<Job[]>`
      SELECT j.id, j.document_id, j.document_version_id, v.version, d.storage_key, d.mime_type
      FROM ingestion_jobs j
      JOIN knowledge_documents d ON d.id = j.document_id
      JOIN knowledge_document_versions v ON v.id = j.document_version_id
      WHERE j.status = 'pending' AND d.deleted_at IS NULL
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    `;
    if (!job) return undefined;
    await tx`UPDATE ingestion_jobs SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = ${job.id}`;
    // Document status is only the admin-facing state of the latest job; chat reads active_version_id.
    await tx`UPDATE knowledge_documents SET status = 'processing', updated_at = now() WHERE id = ${job.document_id}`;
    await tx`UPDATE knowledge_document_versions SET status = 'processing' WHERE id = ${job.document_version_id}`;
    return job;
  });
}

async function parse(job: Job): Promise<ParsedChunk[]> {
  const buffer = await readFile(join(uploadRoot, job.storage_key));
  if (job.mime_type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return parseCatalog(buffer);
  const { text, items } = await extractPdf(buffer);
  const updatedAt = text.match(/Cập nhật\s+(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
  const tableChunks = parsePolicyTable(items, updatedAt);
  return tableChunks.length ? tableChunks : parsePolicyText(text, updatedAt);
}

/** Embeddings from earlier versions of the same document, keyed by unchanged content hash. */
async function reusableEmbeddings(documentId: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, string>();
  const rows = await sql<{ content_hash: string; embedding: string }[]>`
    SELECT DISTINCT ON (c.content_hash) c.content_hash, c.embedding::text AS embedding
    FROM knowledge_chunks c
    JOIN knowledge_document_versions v ON v.id = c.document_version_id
    WHERE v.document_id = ${documentId}
      AND c.embedding_model = ${env.OPENAI_EMBEDDING_MODEL}
      AND c.content_hash IN ${sql(hashes)}
  `;
  return new Map(rows.map((row) => [row.content_hash, row.embedding]));
}

async function embedMissing(chunks: ParsedChunk[], reused: Map<string, string>, traceId: string) {
  const missing = chunks.filter((chunk) => !reused.has(chunk.contentHash));
  let tokens = 0;
  for (let offset = 0; offset < missing.length; offset += env.EMBEDDING_BATCH_SIZE) {
    const batch = missing.slice(offset, offset + env.EMBEDDING_BATCH_SIZE);
    const result = await embedMany({
      model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
      values: batch.map((chunk) => chunk.content),
      maxRetries: env.EMBEDDING_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(env.EMBEDDING_TIMEOUT_MS),
    });
    tokens += result.usage.tokens;
    for (const [index, embedding] of result.embeddings.entries()) {
      if (embedding.length !== env.EMBEDDING_DIMENSIONS) throw new Error(`Embedding có ${embedding.length} chiều, cần ${env.EMBEDDING_DIMENSIONS}.`);
      reused.set(batch[index].contentHash, vectorLiteral(embedding));
    }
    workerLogger.info({ trace_id: traceId, stage: 'ingestion.embedded_batch', size: batch.length, tokens: result.usage.tokens });
  }
  return { embedded: missing.length, tokens };
}

async function processJob(job: Job) {
  const startedAt = Date.now();
  const traceId = randomUUID();
  workerLogger.info({ trace_id: traceId, stage: 'ingestion.started', jobId: job.id, documentId: job.document_id, version: job.version });
  try {
    const chunks = await parse(job);
    if (!chunks.length) throw new Error('Tài liệu không có chunk nào để index.');
    const duplicate = chunks.find((chunk, index) => chunks.findIndex((other) => other.sourceId === chunk.sourceId) !== index);
    if (duplicate) throw new Error(`Source ID bị trùng: ${duplicate.sourceId}`);

    const embeddings = await reusableEmbeddings(job.document_id, [...new Set(chunks.map((chunk) => chunk.contentHash))]);
    const reusedCount = chunks.filter((chunk) => embeddings.has(chunk.contentHash)).length;
    const { embedded, tokens } = await embedMissing(chunks, embeddings, traceId);

    await sql.begin(async (tx) => {
      await tx`DELETE FROM knowledge_chunks WHERE document_version_id = ${job.document_version_id}`;
      for (const chunk of chunks) {
        await tx`
          INSERT INTO knowledge_chunks (
            id, document_version_id, source_id, source_type, title, content, metadata, content_hash, embedding_model, embedding
          ) VALUES (
            ${randomUUID()}, ${job.document_version_id}, ${chunk.sourceId}, ${chunk.sourceType}, ${chunk.title}, ${chunk.content},
            ${tx.json({ ...chunk.metadata, document_version: job.version, content_hash: chunk.contentHash })},
            ${chunk.contentHash}, ${env.OPENAI_EMBEDDING_MODEL}, ${embeddings.get(chunk.contentHash)!}::vector
          )
        `;
      }
      await tx`UPDATE knowledge_document_versions SET status = 'ready', ready_at = now(), error = NULL WHERE id = ${job.document_version_id}`;
      // Activation is the last step, so chat switches versions atomically.
      await tx`UPDATE knowledge_documents SET status = 'ready', active_version_id = ${job.document_version_id}, updated_at = now() WHERE id = ${job.document_id}`;
      await tx`UPDATE ingestion_jobs SET status = 'completed', finished_at = now(), error = NULL WHERE id = ${job.id}`;
    });
    workerLogger.info({ trace_id: traceId, stage: 'ingestion.completed', jobId: job.id, chunks: chunks.length, embedded, reused: reusedCount, embeddingTokens: tokens, latencyMs: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error';
    await sql.begin(async (tx) => {
      await tx`UPDATE knowledge_document_versions SET status = 'failed', error = ${message} WHERE id = ${job.document_version_id}`;
      await tx`UPDATE knowledge_documents SET status = 'failed', updated_at = now() WHERE id = ${job.document_id}`;
      await tx`UPDATE ingestion_jobs SET status = 'failed', error = ${message}, finished_at = now() WHERE id = ${job.id}`;
    });
    workerLogger.error({ trace_id: traceId, stage: 'ingestion.failed', jobId: job.id, error: message, latencyMs: Date.now() - startedAt });
  }
}

/** Runs a maintenance task now and then on an interval, never overlapping itself. */
function every(ms: number, task: () => Promise<void>) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await task(); }
    catch (error) { workerLogger.error({ stage: 'maintenance.failed', error: error instanceof Error ? error.message : String(error) }); }
    finally { running = false; }
  };
  void run();
  setInterval(() => void run(), ms);
}

async function main() {
  workerLogger.info({ stage: 'worker.started' });
  every(15 * 60 * 1_000, expireApprovals);
  every(24 * 60 * 60 * 1_000, cleanupAgentState);
  while (true) {
    const job = await claimJob();
    if (job) await processJob(job);
    else await wait(1_000);
  }
}

void main();
