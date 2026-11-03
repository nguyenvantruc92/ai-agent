import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductListing } from '@/components/shop/listing';
import { buttonClass } from '@/components/ui/button';
import { listStoreCategories } from '@/features/catalog/queries';
import { storeListQuery } from '@/features/catalog/schemas';

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q?.trim();
  return { title: q ? `Tìm “${q}”` : 'Tìm kiếm', robots: { index: false } };
}

export default async function SearchPage({ searchParams }: Props) {
  const raw = await searchParams;
  const parsed = storeListQuery.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value)));
  const query = parsed.success ? parsed.data : storeListQuery.parse({});

  return (
    <div className="py-10">
      <h1 className="font-display text-4xl tracking-tight">{query.q ? <>Kết quả cho “{query.q}”</> : 'Tìm kiếm'}</h1>
      <form action="/search" role="search" className="mt-5 flex max-w-xl gap-2">
        <input name="q" type="search" defaultValue={query.q} autoFocus={!query.q} placeholder="Tên, mã hoặc loại sản phẩm…" aria-label="Từ khóa" className="h-12 flex-1 rounded-md border border-line bg-surface px-4 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none" />
        <button className={buttonClass({ variant: 'primary', size: 'lg' })}>Tìm</button>
      </form>
      <div className="mt-8">
        {query.q ? <ProductListing basePath="/search" query={query} /> : (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Hoặc xem theo danh mục:</p>
            <ul className="flex flex-wrap gap-2">{(await listStoreCategories()).filter((category) => category.productCount > 0).map((category) => (
              <li key={category.id}><Link href={`/c/${category.slug}`} className="inline-block rounded-full border border-line bg-white px-4 py-1.5 text-sm font-medium text-ink-soft hover:border-brand hover:text-brand">{category.name}</Link></li>
            ))}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
