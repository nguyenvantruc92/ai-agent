import { NextResponse } from 'next/server';
import { createDocument, listDocuments } from '@/features/knowledge/repository';
import { saveUpload, validateUpload } from '@/features/knowledge/files';
import { requireAdmin, jsonError } from '@/lib/http';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await listDocuments());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const limit = takeRateLimit(`upload:${clientIp(request)}`, env.UPLOAD_RATE_LIMIT, env.UPLOAD_RATE_WINDOW_SECONDS);
    if (!limit.allowed) return NextResponse.json({ error: 'Quá nhiều lần upload.', retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Cần chọn file PDF hoặc XLSX.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const { extension, mime } = validateUpload(file, bytes);
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
