import Link from 'next/link';
import { ImportButton } from '@/components/admin/import-button';
import { NativeSelect } from '@/components/admin/form';
import { EmptyState, PageHeader, td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { buttonVariants } from '@/components/admin-ui/button-variants';
import { BoxIcon, PlusIcon, SearchIcon } from '@/components/admin-ui/icons';
import { listCategories, listProducts, type ProductStatus } from '@/features/catalog/admin-repository';
import { productStatusCounts } from '@/features/catalog/dashboard';
import { productListQuery } from '@/features/catalog/schemas';
import { LOW_STOCK_AVERAGE } from '@/features/catalog/stock';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sản phẩm · Admin' };

const statusView: Record<ProductStatus, { text: string; color: 'success' | 'gray' | 'warning' }> = {
  active: { text: 'Đang bán', color: 'success' },
  draft: { text: 'Nháp', color: 'gray' },
  archived: { text: 'Lưu trữ', color: 'warning' },
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  // Blank form fields arrive as "", which must mean "no filter" rather than a validation error.
  const parsed = productListQuery.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value)));
  const query = parsed.success ? parsed.data : productListQuery.parse({});
  const [categories, result, counts] = await Promise.all([listCategories(), listProducts(query), productStatusCounts()]);
  const link = (page: number, status = query.status) => {
    const params = new URLSearchParams(Object.entries({ q: query.q, categoryId: query.categoryId, status, page: page > 1 ? String(page) : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/admin/products${params.size ? `?${params}` : ''}`;
  };
  const tabs = [
    { label: 'Tất cả', status: undefined, count: counts.all },
    { label: 'Đang bán', status: 'active' as const, count: counts.active },
    { label: 'Nháp', status: 'draft' as const, count: counts.draft },
    { label: 'Lưu trữ', status: 'archived' as const, count: counts.archived },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Sản phẩm" description="Mọi thay đổi được chatbot cập nhật tự động sau vài giây."
        actions={<><ImportButton /><Link href="/admin/products/new" className={buttonVariants({  })}><PlusIcon />Thêm sản phẩm</Link></>} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Lọc theo trạng thái" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
          {tabs.map((tab) => {
            const active = tab.status === query.status;
            return (
              <Link key={tab.label} href={link(1, tab.status)} aria-current={active ? 'page' : undefined}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors', active ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white')}>
                {tab.label}<span className={cn('rounded-full px-1.5 py-0.5 text-xs tabular-nums', active ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400' : 'bg-gray-200/60 text-gray-500 dark:bg-white/5 dark:text-gray-400')}>{tab.count}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap gap-2">
          {query.status && <input type="hidden" name="status" value={query.status} />}
          <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={query.q} placeholder="Tìm theo tên hoặc mã…" className="h-9 w-60 rounded-lg border border-gray-300 bg-white pr-4 pl-11 text-sm text-gray-800 shadow-theme-xs outline-hidden placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <NativeSelect name="categoryId" defaultValue={query.categoryId ?? ''} className="w-48" aria-label="Danh mục">
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </NativeSelect>
          <Button size="sm" type="submit" variant="outline">Lọc</Button>
          {(query.q || query.categoryId) && <Link href={query.status ? `/admin/products?status=${query.status}` : '/admin/products'} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Xóa lọc</Link>}
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr><th className={th}>Sản phẩm</th><th className={th}>Danh mục</th><th className={`${thEnd}`}>Giá</th><th className={`${thEnd}`}>Tồn kho</th><th className={th}>Trạng thái</th><th className="w-20" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {result.items.length === 0 && <tr><td colSpan={6}><EmptyState icon={<BoxIcon />} title="Không có sản phẩm phù hợp" hint="Thử đổi bộ lọc hoặc thêm sản phẩm mới." /></td></tr>}
              {result.items.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails are small local files */}
                      {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-12 rounded-lg object-cover" /> : <div className="grid size-12 place-items-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800"><BoxIcon className="size-5" /></div>}
                      <div className="min-w-0"><Link href={`/admin/products/${product.id}`} className="block truncate font-medium text-gray-800 hover:underline dark:text-white/90">{product.name}</Link><p className="text-theme-xs text-gray-500 dark:text-gray-400">{product.code} · {product.variantCount} biến thể</p></div>
                    </div>
                  </td>
                  <td className={td}>{product.categoryName}</td>
                  <td className={`${td} text-end tabular-nums`}>{formatVnd(product.priceVnd)}{product.compareAtPriceVnd && <s className="block text-theme-xs text-gray-400">{formatVnd(product.compareAtPriceVnd)}</s>}</td>
                  <td className={`${td} text-end tabular-nums`}>
                    {product.stockTotal === 0 ? <Badge color="error" size="sm">Hết hàng</Badge>
                      : product.variantCount && product.stockTotal / product.variantCount <= LOW_STOCK_AVERAGE ? <span className="inline-flex items-center gap-2">{product.stockTotal}<Badge color="warning" size="sm">Sắp hết</Badge></span>
                      : product.stockTotal}
                  </td>
                  <td className={td}><Badge color={statusView[product.status].color} size="sm">{statusView[product.status].text}</Badge></td>
                  <td className={`${td} text-end`}><Link href={`/admin/products/${product.id}`} className="text-brand-500 hover:underline dark:text-brand-400">Sửa</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.pageCount > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>Trang {result.page}/{result.pageCount} · {result.total} sản phẩm</span>
          <div className="flex gap-2">
            {result.page > 1 && <Link href={link(result.page - 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>← Trước</Link>}
            {result.page < result.pageCount && <Link href={link(result.page + 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Sau →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
