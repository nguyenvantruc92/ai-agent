import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProductDetail, softDeleteProduct, updateProduct } from '@/features/catalog/admin-repository';
import { productUpdateInput } from '@/features/catalog/schemas';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await getProductDetail(idSchema.parse((await params).id))); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await updateProduct(idSchema.parse((await params).id), productUpdateInput.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}

export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { await softDeleteProduct(idSchema.parse((await params).id)); return NextResponse.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
