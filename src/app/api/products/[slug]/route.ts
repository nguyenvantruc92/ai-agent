import { NextResponse } from 'next/server';
import { getStoreProduct, listRelatedProducts } from '@/features/catalog/queries';
import { apiError } from '@/lib/http';

type Context = { params: Promise<{ slug: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const product = await getStoreProduct((await params).slug.toLowerCase());
    return NextResponse.json({ ...product, related: await listRelatedProducts(product.categorySlug, product.id) });
  } catch (error) { return apiError(error); }
}
