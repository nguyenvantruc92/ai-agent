import { NextResponse } from 'next/server';
import { catalogMime } from '@/features/catalog/sync';
import { createDocument, listDocuments } from '@/features/knowledge/repository';
import { scopesByDocument } from '@/features/knowledge/scopes';
import { saveUpload, validateUpload } from '@/features/knowledge/files';
import { requireAdmin, jsonError, tooManyRequests } from '@/lib/http';
import { randomUUID } from 'node:crypto';
import { importCatalog } from '@/features/catalog/import';
import { env } from '@/lib/env';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  // The product catalog document only backs product search; it is not a knowledge file, so it is not listed here.
  const [documents, scopes] = await Promise.all([listDocuments(), scopesByDocument()]);
  return NextResponse.json(documents.filter((document) => document.mime_type !== catalogMime).map((document) => ({ ...document, scopes: scopes.get(document.id) ?? [] })));
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const limit = await takeRateLimit(`upload:${clientIp(request)}`, env.UPLOAD_RATE_LIMIT, env.UPLOAD_RATE_WINDOW_SECONDS);
    if (!limit.allowed) return tooManyRequests({ error: 'Quá nhiều lần upload.' }, limit.retryAfterSeconds);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Cần chọn file PDF, Markdown, TXT hoặc XLSX.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const { extension, mime } = validateUpload(file, bytes);
    // A spreadsheet is a product import, not a knowledge file: it updates the products table.
    if (extension === '.xlsx') return NextResponse.json({ imported: await importCatalog(bytes) }, { status: 200 });
    const documentId = randomUUID();
    const saved = await saveUpload(documentId, extension, bytes);
    const created = await createDocument({
      id: documentId,
      original_filename: file.name.replace(/[\\/\0]/g, '_').slice(0, 180),
      storage_key: saved.key,
      mime_type: mime,
      content_hash: saved.contentHash,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return jsonError(error); }
}
