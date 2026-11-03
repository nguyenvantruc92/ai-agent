import Link from 'next/link';
import { ProductGrid } from '@/components/shop/product-card';
import { buttonClass } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import { listStoreProducts } from '@/features/catalog/queries';
import type { StoreListQuery } from '@/features/catalog/schemas';

const sortLabels: Record<StoreListQuery['sort'], string> = { newest: 'Mới nhất', price_asc: 'Giá tăng dần', price_desc: 'Giá giảm dần', name: 'Tên A–Z' };

/** Link to the same listing with some parameters changed; empty values are dropped from the URL. */
function href(basePath: string, query: StoreListQuery, change: Partial<Record<string, string | undefined>> = {}) {
  const base: Record<string, string | undefined> = {
    q: query.q, sort: query.sort === 'newest' ? undefined : query.sort,
    minPrice: query.minPrice?.toString(), maxPrice: query.maxPrice?.toString(),
    inStock: query.inStock ? 'true' : undefined, onSale: query.onSale ? 'true' : undefined,
    page: query.page > 1 ? String(query.page) : undefined,
  };
  const params = new URLSearchParams(Object.entries({ ...base, ...change }).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return `${basePath}${params.size ? `?${params}` : ''}`;
}

/** Filter bar (plain GET form, works without JS), result grid and pagination for category and search pages. */
export async function ProductListing({ basePath, query }: { basePath: string; query: StoreListQuery }) {
  const result = await listStoreProducts(query);
  const filtered = Boolean(query.minPrice !== undefined || query.maxPrice !== undefined || query.inStock || query.onSale);

  return (
    <div className="space-y-6">
      <form action={basePath} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-sand/50 p-4">
        {query.q && <input type="hidden" name="q" value={query.q} />}
        <label className="space-y-1 text-xs font-medium text-ink-soft">Sắp xếp
          <select name="sort" defaultValue={query.sort} className={`${inputClass} w-40`}>
            {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">Giá từ (₫)
          <input name="minPrice" type="number" min={0} step={10000} defaultValue={query.minPrice} placeholder="0" className={`${inputClass} w-32`} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">đến (₫)
          <input name="maxPrice" type="number" min={0} step={10000} defaultValue={query.maxPrice} placeholder="Không giới hạn" className={`${inputClass} w-36`} />
        </label>
        <label className="flex h-10 items-center gap-2 text-sm text-ink-soft"><input type="checkbox" name="inStock" value="true" defaultChecked={query.inStock} className="accent-[var(--color-brand)]" />Còn hàng</label>
        <label className="flex h-10 items-center gap-2 text-sm text-ink-soft"><input type="checkbox" name="onSale" value="true" defaultChecked={query.onSale} className="accent-[var(--color-brand)]" />Đang giảm giá</label>
        <button className={buttonClass({ variant: 'primary' })}>Áp dụng</button>
        {(filtered || query.sort !== 'newest') && <Link href={query.q ? `${basePath}?q=${encodeURIComponent(query.q)}` : basePath} className={buttonClass({ variant: 'ghost' })}>Xóa lọc</Link>}
      </form>

      <p className="text-sm font-medium text-ink-soft" aria-live="polite">{result.total} sản phẩm</p>

      {result.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-16 text-center">
          <p className="font-display text-xl">Không tìm thấy sản phẩm phù hợp</p>
          <p className="mt-1 text-sm text-ink-soft">Thử bỏ bớt bộ lọc hoặc dùng từ khóa khác. Bạn cũng có thể nhờ trợ lý AI gợi ý.</p>
          <Link href="/chat" className={`${buttonClass({ variant: 'brand' })} mt-5`}>Hỏi trợ lý AI</Link>
        </div>
      ) : <ProductGrid products={result.items} />}

      {result.pageCount > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-between border-t border-line pt-5 text-sm text-ink-soft">
          <span>Trang {result.page}/{result.pageCount}</span>
          <div className="flex gap-2">
            {result.page > 1 && <Link href={href(basePath, query, { page: result.page > 2 ? String(result.page - 1) : undefined })} className={buttonClass({ variant: 'outline', size: 'sm' })}>← Trước</Link>}
            {result.page < result.pageCount && <Link href={href(basePath, query, { page: String(result.page + 1) })} className={buttonClass({ variant: 'outline', size: 'sm' })}>Sau →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
