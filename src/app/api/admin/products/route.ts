import { NextResponse } from 'next/server';
import { createProduct, listProducts } from '@/features/catalog/admin-repository';
import { productCreateInput, productListQuery } from '@/features/catalog/schemas';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await listProducts(productListQuery.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await createProduct(productCreateInput.parse(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
