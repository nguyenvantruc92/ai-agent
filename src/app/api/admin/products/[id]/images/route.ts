import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addProductImage, reorderProductImages } from '@/features/catalog/admin-repository';
import { detectImage, saveProductImage } from '@/features/catalog/images';
import { imageOrderInput } from '@/features/catalog/schemas';
import { HttpError, apiError, requireAdmin } from '@/lib/http';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function POST(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const productId = idSchema.parse((await params).id);
    const limit = takeRateLimit(`image-upload:${clientIp(request)}`, 60, 3600);
    if (!limit.allowed) throw new HttpError('Quá nhiều lần upload ảnh.', 429);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError('Cần chọn file ảnh.', 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    let format;
    try { format = detectImage(bytes); } catch (error) { throw new HttpError(error instanceof Error ? error.message : 'Ảnh không hợp lệ.', 400); }
    const key = await saveProductImage(productId, format.ext, bytes);
    const alt = String(form.get('alt') ?? '').slice(0, 200);
    return NextResponse.json(await addProductImage(productId, key, alt), { status: 201 });
  } catch (error) { return apiError(error); }
}

/** Body `{ order: [imageId, ...] }`: the first image is the product's cover. */
export async function PUT(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    await reorderProductImages(idSchema.parse((await params).id), imageOrderInput.parse(await request.json()).order);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
