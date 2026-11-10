import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { catalogMime } from '@/features/catalog/sync';

export type DocumentRow = {
  id: string; original_filename: string; storage_key: string; mime_type: string; content_hash: string;
  status: 'uploaded' | 'processing' | 'ready' | 'review' | 'failed' | 'deleted'; deleted_at: string | null; created_at: string; updated_at: string;
  content_kind: 'general' | 'policy'; policy_key: string | null; effective_from: string | null; effective_to: string | null; supersedes_document_id: string | null;
  version_id?: string; version?: number; version_status?: string; safety_status?: SafetyStatus; safety_findings?: SafetyFinding[]; error?: string | null;
  active_version_id: string | null; active_version?: number | null;
};

export type SafetyStatus = 'pending_scan' | 'needs_review' | 'approved' | 'rejected';
export type SafetyFinding = { rule: string; severity: 'high' | 'medium'; count: number };
export type VersionRow = { id: string; version: number; status: string; safety_status: SafetyStatus; safety_findings: SafetyFinding[]; error: string | null; created_at: string; ready_at: string | null; chunk_count: number };
export type JobRow = { id: string; version: number; status: string; attempts: number; error: string | null; created_at: string; started_at: string | null; finished_at: string | null };
export type ChunkRow = { source_id: string; source_type: string; title: string; content: string; metadata: Record<string, unknown> };

export async function listDocuments() {
  return sql<DocumentRow[]>`
    SELECT d.*, v.id AS version_id, v.version, v.status AS version_status, v.safety_status, v.safety_findings, v.error, av.version AS active_version
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
    SELECT d.*, v.id AS version_id, v.version, v.status AS version_status, v.safety_status, v.safety_findings, v.error, av.version AS active_version
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
    await tx`INSERT INTO knowledge_document_versions (id, document_id, version, status, safety_status) VALUES (${versionId}, ${id}, 1, 'pending', 'pending_scan')`;
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
    await tx`INSERT INTO knowledge_document_versions (id, document_id, version, status, safety_status) VALUES (${versionId}, ${id}, ${version}, 'pending', 'pending_scan')`;
    await tx`INSERT INTO ingestion_jobs (id, document_id, document_version_id) VALUES (${jobId}, ${id}, ${versionId})`;
  });
  return { versionId, jobId };
}

export async function softDeleteDocument(id: string) {
  const document = await getDocument(id);
  if (!document || document.deleted_at) throw new Error('Không tìm thấy tài liệu.');
  if (document.mime_type === catalogMime) throw new Error('Catalog sản phẩm được tạo từ danh sách sản phẩm, không xóa được.');
  await sql`UPDATE knowledge_documents SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = ${id}`;
  return document;
}

export async function listVersions(documentId: string) {
  return sql<VersionRow[]>`
    SELECT v.id, v.version, v.status, v.safety_status, v.safety_findings, v.error, v.created_at, v.ready_at,
      (SELECT count(*)::int FROM knowledge_chunks c WHERE c.document_version_id = v.id) AS chunk_count
    FROM knowledge_document_versions v
    WHERE v.document_id = ${documentId}
    ORDER BY v.version DESC
  `;
}

export type DocumentMetadata = {
  contentKind: 'general' | 'policy'; policyKey: string | null; effectiveFrom: string | null; effectiveTo: string | null; supersedesDocumentId: string | null;
};

export async function updateDocumentMetadata(id: string, input: DocumentMetadata) {
  const document = await getDocument(id);
  if (!document || document.deleted_at) throw new Error('Không tìm thấy tài liệu.');
  if (input.contentKind === 'policy' && !input.policyKey?.trim()) throw new Error('Tài liệu chính sách cần policy key để xử lý version và mâu thuẫn.');
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new Error('Ngày hết hiệu lực phải sau ngày bắt đầu.');
  if (input.supersedesDocumentId === id) throw new Error('Tài liệu không thể thay thế chính nó.');
  await sql`
    UPDATE knowledge_documents SET content_kind = ${input.contentKind}, policy_key = ${input.contentKind === 'policy' ? input.policyKey?.trim() || null : null},
      effective_from = ${input.contentKind === 'policy' ? input.effectiveFrom : null}, effective_to = ${input.contentKind === 'policy' ? input.effectiveTo : null},
      supersedes_document_id = ${input.contentKind === 'policy' ? input.supersedesDocumentId : null}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function decideSafetyReview(documentId: string, versionId: string, decision: 'approved' | 'rejected') {
  const [version] = await sql<{ id: string; status: string; safety_status: SafetyStatus }[]>`
    SELECT v.id, v.status, v.safety_status FROM knowledge_document_versions v
    JOIN knowledge_documents d ON d.id = v.document_id
    WHERE v.id = ${versionId} AND v.document_id = ${documentId} AND d.deleted_at IS NULL
  `;
  if (!version) throw new Error('Không tìm thấy version tài liệu.');
  if (version.safety_status !== 'needs_review') throw new Error('Version này không chờ duyệt an toàn.');
  if (decision === 'rejected') {
    await sql`UPDATE knowledge_document_versions SET safety_status = 'rejected', status = 'review' WHERE id = ${versionId}`;
    await sql`UPDATE knowledge_documents SET status = 'review', updated_at = now() WHERE id = ${documentId}`;
    return { queued: false };
  }
  const jobId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`UPDATE knowledge_document_versions SET safety_status = 'approved', safety_findings = '[]'::jsonb, status = 'pending', error = NULL WHERE id = ${versionId}`;
    await tx`UPDATE knowledge_documents SET status = 'uploaded', updated_at = now() WHERE id = ${documentId}`;
    await tx`INSERT INTO ingestion_jobs (id, document_id, document_version_id) VALUES (${jobId}, ${documentId}, ${versionId})`;
  });
  return { queued: true, jobId };
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
