import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sql } from '@/db/client';
import { uploadRoot } from '@/features/knowledge/files';
import { env } from '@/lib/env';

export const seedRoot = join(process.cwd(), 'data', 'seed');
const snapshotPath = join(seedRoot, 'knowledge-snapshot.json');
const seedUploads = join(seedRoot, 'uploads');

type SnapshotDocument = { id: string; original_filename: string; storage_key: string; mime_type: string; content_hash: string; active_version_id: string; created_at: string; updated_at: string };
type SnapshotVersion = { id: string; document_id: string; version: number; created_at: string; ready_at: string | null };
type SnapshotJob = { id: string; document_id: string; document_version_id: string; status: string; attempts: number; created_at: string; started_at: string | null; finished_at: string | null };
type SnapshotChunk = { id: string; document_version_id: string; source_id: string; source_type: string; title: string; content: string; metadata: Record<string, unknown>; content_hash: string; embedding_model: string; embedding: string; created_at: string };
type Snapshot = { format: 1; exported_at: string; embedding_model: string; embedding_dimensions: number; documents: SnapshotDocument[]; versions: SnapshotVersion[]; jobs: SnapshotJob[]; chunks: SnapshotChunk[] };

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// postgres.js returns Date objects; the snapshot stores plain JSON.
const plain = <T>(rows: unknown): T[] => JSON.parse(JSON.stringify(rows)) as T[];

/**
 * Writes only the active version of each live document (chunks with embeddings
 * plus the source file) to data/seed. Chat, approvals and orders are not exported.
 */
export async function exportKnowledgeSnapshot() {
  const documents = plain<SnapshotDocument>(await sql`
    SELECT id, original_filename, storage_key, mime_type, content_hash, active_version_id, created_at, updated_at
    FROM knowledge_documents
    WHERE deleted_at IS NULL AND active_version_id IS NOT NULL
    ORDER BY created_at
  `);
  if (!documents.length) throw new Error('Không có tài liệu nào có version active để export.');
  const versionIds = documents.map((document) => document.active_version_id);
  const versions = plain<SnapshotVersion>(await sql`
    SELECT id, document_id, version, created_at, ready_at FROM knowledge_document_versions WHERE id IN ${sql(versionIds)} ORDER BY created_at
  `);
  const jobs = plain<SnapshotJob>(await sql`
    SELECT id, document_id, document_version_id, status, attempts, created_at, started_at, finished_at
    FROM ingestion_jobs WHERE document_version_id IN ${sql(versionIds)} AND status = 'completed' ORDER BY created_at
  `);
  const chunks = plain<SnapshotChunk>(await sql`
    SELECT id, document_version_id, source_id, source_type, title, content, metadata, content_hash, embedding_model, embedding::text AS embedding, created_at
    FROM knowledge_chunks WHERE document_version_id IN ${sql(versionIds)} ORDER BY document_version_id, source_id
  `);

  for (const document of documents) {
    const bytes = await readFile(join(uploadRoot, document.storage_key));
    if (sha256(bytes) !== document.content_hash) throw new Error(`File của ${document.original_filename} không khớp content_hash.`);
    const target = join(seedUploads, document.storage_key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const snapshot: Snapshot = { format: 1, exported_at: new Date().toISOString(), embedding_model: env.OPENAI_EMBEDDING_MODEL, embedding_dimensions: env.EMBEDDING_DIMENSIONS, documents, versions, jobs, chunks };
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 1)}\n`);
  return { documents: documents.length, chunks: chunks.length };
}

/**
 * Loads the committed snapshot into an empty knowledge base, so a fresh clone
 * serves chat without re-embedding. Returns the number of imported documents.
 */
export async function importKnowledgeSnapshot() {
  if (!existsSync(snapshotPath)) return 0;
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM knowledge_documents`;
  if (count > 0) return 0;

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot;
  if (snapshot.embedding_model !== env.OPENAI_EMBEDDING_MODEL || snapshot.embedding_dimensions !== env.EMBEDDING_DIMENSIONS) {
    console.warn(`Bỏ qua knowledge snapshot: embedding ${snapshot.embedding_model}/${snapshot.embedding_dimensions} khác cấu hình ${env.OPENAI_EMBEDDING_MODEL}/${env.EMBEDDING_DIMENSIONS}. Chạy pnpm db:seed để index lại.`);
    return 0;
  }

  for (const document of snapshot.documents) {
    const bytes = await readFile(join(seedUploads, document.storage_key));
    if (sha256(bytes) !== document.content_hash) throw new Error(`File seed của ${document.original_filename} không khớp content_hash.`);
    const target = join(uploadRoot, document.storage_key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  await sql.begin(async (tx) => {
    for (const document of snapshot.documents) {
      await tx`
        INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash, status, created_at, updated_at)
        VALUES (${document.id}, ${document.original_filename}, ${document.storage_key}, ${document.mime_type}, ${document.content_hash}, 'ready', ${document.created_at}, ${document.updated_at})
      `;
    }
    for (const version of snapshot.versions) {
      await tx`
        INSERT INTO knowledge_document_versions (id, document_id, version, status, created_at, ready_at)
        VALUES (${version.id}, ${version.document_id}, ${version.version}, 'ready', ${version.created_at}, ${version.ready_at})
      `;
    }
    for (const job of snapshot.jobs) {
      await tx`
        INSERT INTO ingestion_jobs (id, document_id, document_version_id, status, attempts, created_at, started_at, finished_at)
        VALUES (${job.id}, ${job.document_id}, ${job.document_version_id}, ${job.status}, ${job.attempts}, ${job.created_at}, ${job.started_at}, ${job.finished_at})
      `;
    }
    for (const chunk of snapshot.chunks) {
      await tx`
        INSERT INTO knowledge_chunks (id, document_version_id, source_id, source_type, title, content, metadata, content_hash, embedding_model, embedding, created_at)
        VALUES (
          ${chunk.id}, ${chunk.document_version_id}, ${chunk.source_id}, ${chunk.source_type}, ${chunk.title}, ${chunk.content},
          ${tx.json(chunk.metadata as never)}, ${chunk.content_hash}, ${chunk.embedding_model}, ${chunk.embedding}::vector, ${chunk.created_at}
        )
      `;
    }
    for (const document of snapshot.documents) {
      await tx`UPDATE knowledge_documents SET active_version_id = ${document.active_version_id} WHERE id = ${document.id}`;
    }
  });
  return snapshot.documents.length;
}
