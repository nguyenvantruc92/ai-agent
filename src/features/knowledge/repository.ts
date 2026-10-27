import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';

export type DocumentRow = {
  id: string; original_filename: string; storage_key: string; mime_type: string; content_hash: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted'; deleted_at: string | null; created_at: string; updated_at: string;
  version_id?: string; version?: number; version_status?: string; error?: string | null;
  active_version_id: string | null; active_version?: number | null;
};

export type VersionRow = { id: string; version: number; status: string; error: string | null; created_at: string; ready_at: string | null; chunk_count: number };
export type JobRow = { id: string; version: number; status: string; attempts: number; error: string | null; created_at: string; started_at: string | null; finished_at: string | null };
export type ChunkRow = { source_id: string; source_type: string; title: string; content: string; metadata: Record<string, unknown> };

export async function listDocuments() {
  return sql<DocumentRow[]>`
    SELECT d.*, v.id AS version_id, v.version, v.status AS version_status, v.error, av.version AS active_version
    FROM knowledge_documents d
    LEFT JOIN LATERAL (
      SELECT * FROM knowledge_document_versions WHERE document_id = d.id ORDER BY version DESC LIMIT 1
    ) v ON true
    LEFT JOIN knowledge_document_versions av ON av.id = d.active_version_id
    WHERE d.deleted_at IS NULL
    ORDER BY d.created_at DESC
  `;
}

export async function getDocument(id: string) {
  const [document] = await sql<DocumentRow[]>`
    SELECT d.*, v.id AS version_id, v.version, v.status AS version_status, v.error, av.version AS active_version
    FROM knowledge_documents d
    LEFT JOIN LATERAL (
      SELECT * FROM knowledge_document_versions WHERE document_id = d.id ORDER BY version DESC LIMIT 1
    ) v ON true
    LEFT JOIN knowledge_document_versions av ON av.id = d.active_version_id
    WHERE d.id = ${id}
  `;
  return document;
}

export async function createDocument(input: Pick<DocumentRow, 'original_filename' | 'storage_key' | 'mime_type' | 'content_hash'> & { id?: string }) {
  const id = input.id ?? randomUUID();
  const versionId = randomUUID();
  const jobId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash)
      VALUES (${id}, ${input.original_filename}, ${input.storage_key}, ${input.mime_type}, ${input.content_hash})
    `;
    await tx`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${id}, 1, 'pending')`;
    await tx`INSERT INTO ingestion_jobs (id, document_id, document_version_id) VALUES (${jobId}, ${id}, ${versionId})`;
  });
  return { id, versionId, jobId };
}

export async function reindexDocument(id: string) {
  const document = await getDocument(id);
  if (!document || document.deleted_at) throw new Error('Không tìm thấy tài liệu.');
  const versionId = randomUUID();
  const jobId = randomUUID();
  const version = Number(document.version ?? 0) + 1;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${id}, ${version}, 'pending')`;
    await tx`INSERT INTO ingestion_jobs (id, document_id, document_version_id) VALUES (${jobId}, ${id}, ${versionId})`;
  });
  return { versionId, jobId };
}

export async function softDeleteDocument(id: string) {
  const document = await getDocument(id);
  if (!document || document.deleted_at) throw new Error('Không tìm thấy tài liệu.');
  await sql`UPDATE knowledge_documents SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = ${id}`;
  return document;
}

export async function listVersions(documentId: string) {
  return sql<VersionRow[]>`
    SELECT v.id, v.version, v.status, v.error, v.created_at, v.ready_at,
      (SELECT count(*)::int FROM knowledge_chunks c WHERE c.document_version_id = v.id) AS chunk_count
    FROM knowledge_document_versions v
    WHERE v.document_id = ${documentId}
    ORDER BY v.version DESC
  `;
}

export async function listJobs(documentId: string) {
  return sql<JobRow[]>`
    SELECT j.id, v.version, j.status, j.attempts, j.error, j.created_at, j.started_at, j.finished_at
    FROM ingestion_jobs j
    JOIN knowledge_document_versions v ON v.id = j.document_version_id
    WHERE j.document_id = ${documentId}
    ORDER BY j.created_at DESC
    LIMIT 20
  `;
}

export async function listChunks(versionId: string) {
  return sql<ChunkRow[]>`
    SELECT source_id, source_type, title, content, metadata
    FROM knowledge_chunks
    WHERE document_version_id = ${versionId}
    ORDER BY source_id
  `;
}
