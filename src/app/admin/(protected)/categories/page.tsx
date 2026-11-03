import { CategoriesClient } from '@/components/admin/categories-client';
import { listCategories } from '@/features/catalog/admin-repository';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Danh mục · Admin' };

export default async function CategoriesPage() {
  return <CategoriesClient initial={await listCategories()} />;
}
