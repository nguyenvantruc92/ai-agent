import { NextResponse } from 'next/server';
import { listStoreCategories } from '@/features/catalog/queries';
import { apiError } from '@/lib/http';

export async function GET() {
  try { return NextResponse.json(await listStoreCategories()); }
  catch (error) { return apiError(error); }
}
