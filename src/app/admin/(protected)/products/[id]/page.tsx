import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ProductForm } from '@/components/admin/product-form';
import { getProductDetail, listCategories } from '@/features/catalog/admin-repository';
import { HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sửa sản phẩm · Admin' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const product = await getProductDetail(id.data).catch((error) => { if (error instanceof HttpError && error.status === 404) return null; throw error; });
  if (!product) notFound();
  return <ProductForm categories={await listCategories()} product={product} />;
}
