import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { logger } from '@/lib/logger';
import { safeError } from '@/lib/redact';

/** The catalog is indexed as one synthetic knowledge document built from the products table. */
export const catalogMime = 'application/x-catalog-db';
export const catalogStorageKey = 'db:catalog';
export const catalogFilename = 'Catalog sản phẩm (từ cơ sở dữ liệu)';

/**
 * Queues a re-index of the catalog document so chat sees product changes. If a job is
 * still pending, nothing is added: the worker builds chunks from the table when it runs,
 * so it will pick up this change too. Unchanged products reuse their embeddings.
 */
export async function queueCatalogReindex() {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7242002)`;
    let [document] = await tx<{ id: string }[]>`SELECT id FROM knowledge_documents WHERE storage_key = ${catalogStorageKey}`;
    if (!document) {
      document = { id: randomUUID() };
      await tx`
        INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash)
        VALUES (${document.id}, ${catalogFilename}, ${catalogStorageKey}, ${catalogMime}, 'catalog-db')
      `;
    }
    const [pending] = await tx`SELECT 1 FROM ingestion_jobs WHERE document_id = ${document.id} AND status = 'pending' LIMIT 1`;
    if (pending) return { queued: false as const, documentId: document.id };
    const [{ next }] = await tx<{ next: number }[]>`SELECT coalesce(max(version), 0) + 1 AS next FROM knowledge_document_versions WHERE document_id = ${document.id}`;
    const versionId = randomUUID();
    await tx`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${document.id}, ${next}, 'pending')`;
    await tx`INSERT INTO ingestion_jobs (id, document_id, document_version_id) VALUES (${randomUUID()}, ${document.id}, ${versionId})`;
    return { queued: true as const, documentId: document.id };
  });
}

/** Chat reads product chunks, so stock/price changes re-index. A queue failure must never undo a committed change. */
export async function syncCatalog() {
  try { await queueCatalogReindex(); }
  catch (error) { logger.warn({ stage: 'catalog.sync_failed', error: safeError(error) }); }
}
