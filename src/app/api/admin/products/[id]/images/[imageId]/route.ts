import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteProductImage } from '@/features/catalog/admin-repository';
import { moveToTrash } from '@/features/knowledge/files';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string; imageId: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id, imageId } = await params;
    const key = await deleteProductImage(idSchema.parse(id), idSchema.parse(imageId));
    await moveToTrash(key).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
