import { NextResponse } from 'next/server';
import { createCategory, listCategories } from '@/features/catalog/admin-repository';
import { categoryInput } from '@/features/catalog/schemas';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await listCategories());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await createCategory(categoryInput.parse(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
