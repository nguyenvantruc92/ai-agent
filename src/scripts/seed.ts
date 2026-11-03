import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDocument, listDocuments, reindexDocument } from '@/features/knowledge/repository';
import { saveUpload, validateUpload } from '@/features/knowledge/files';
import { sql } from '@/db/client';
import { seedCatalogIfEmpty } from '@/features/catalog/import';
import { queueCatalogReindex } from '@/features/catalog/sync';

// Products are seeded into the database by `db:migrate`; only the policy PDF is a knowledge file.
const seeds = ['faq_chinh_sach_cua_hang.pdf'];

async function main() {
  if (await seedCatalogIfEmpty()) console.log('Imported demo catalog');
  console.log((await queueCatalogReindex()).queued ? 'Queued catalog' : 'Catalog already queued');
  const existing = await listDocuments();
  for (const filename of seeds) {
    const current = existing.find((document) => document.original_filename === filename);
    if (current) {
      if (current.status === 'failed') {
        await reindexDocument(current.id);
        console.log(`Re-queued ${filename}`);
      }
      continue;
    }
    const bytes = await readFile(join(process.cwd(), 'data', 'raw', filename));
    const file = new File([bytes], filename, { type: filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const { extension, mime } = validateUpload(file, bytes);
    const documentId = randomUUID();
    const saved = await saveUpload(documentId, extension, bytes);
    await createDocument({ id: documentId, original_filename: filename, storage_key: saved.key, mime_type: mime, content_hash: saved.contentHash });
    console.log(`Queued ${filename}`);
  }
  await sql.end();
}

void main();
