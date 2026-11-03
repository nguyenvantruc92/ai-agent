import { NextResponse } from 'next/server';
import { listStoreProducts } from '@/features/catalog/queries';
import { storeListQuery } from '@/features/catalog/schemas';
import { apiError } from '@/lib/http';

/** Public product listing: ?category=&q=&sort=&minPrice=&maxPrice=&inStock=&page=&pageSize= */
export async function GET(request: Request) {
  try { return NextResponse.json(await listStoreProducts(storeListQuery.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return apiError(error); }
}
