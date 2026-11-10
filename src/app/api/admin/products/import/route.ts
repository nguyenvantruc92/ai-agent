import { NextResponse } from 'next/server';
import { importCatalog } from '@/features/catalog/import';
import { validateUpload } from '@/features/knowledge/files';
import { HttpError, apiError, rateLimitError, requireAdmin } from '@/lib/http';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';

/** Upserts products/categories/variants from the catalog spreadsheet. Existing stock is kept. */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const limit = await takeRateLimit(`upload:${clientIp(request)}`, env.UPLOAD_RATE_LIMIT, env.UPLOAD_RATE_WINDOW_SECONDS);
    if (!limit.allowed) throw rateLimitError('Quá nhiều lần upload.', limit.retryAfterSeconds);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) throw new HttpError('Cần chọn file XLSX.', 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const { extension } = validateUpload(file, bytes);
    if (extension !== '.xlsx') throw new HttpError('Chỉ nhận file XLSX.', 400);
    return NextResponse.json(await importCatalog(bytes));
  } catch (error) {
    // A plain Error comes from our own parser (missing sheet/column); driver errors are subclasses.
    if (error instanceof Error && error.constructor === Error) return apiError(new HttpError(error.message, 400));
    return apiError(error);
  }
}
