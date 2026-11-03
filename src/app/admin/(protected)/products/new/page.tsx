import { ProductForm } from '@/components/admin/product-form';
import { listCategories } from '@/features/catalog/admin-repository';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Thêm sản phẩm · Admin' };

export default async function NewProductPage() {
  return <ProductForm categories={await listCategories()} />;
}
