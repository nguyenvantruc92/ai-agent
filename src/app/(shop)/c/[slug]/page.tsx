import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductListing } from '@/components/shop/listing';
import { listStoreCategories } from '@/features/catalog/queries';
import { storeListQuery } from '@/features/catalog/schemas';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug.toLowerCase();
  const category = (await listStoreCategories()).find((item) => item.slug === slug);
  return category ? { title: category.name, description: category.description || `${category.name} nam: chất liệu thoải mái, form chuẩn.` } : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const slug = (await params).slug.toLowerCase();
  const categories = await listStoreCategories();
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const raw = await searchParams;
  const parsed = storeListQuery.safeParse({ ...Object.fromEntries(Object.entries(raw).filter(([, value]) => value)), category: slug });
  const query = parsed.success ? parsed.data : storeListQuery.parse({ category: slug });

  return (
    <div className="py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted"><Link href="/" className="hover:text-ink">Trang chủ</Link> / <span className="text-ink">{category.name}</span></nav>
      <div className="mb-8">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">{category.name}</h1>
        {category.description && <p className="mt-2 max-w-2xl text-ink-soft">{category.description}</p>}
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Danh mục khác">
          {categories.filter((item) => item.productCount > 0).map((item) => (
            <li key={item.id}><Link href={`/c/${item.slug}`} aria-current={item.slug === slug ? 'page' : undefined}
              className={`inline-block rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${item.slug === slug ? 'border-brand bg-brand text-white shadow-sm shadow-brand/30' : 'border-line bg-white text-ink-soft hover:border-brand hover:text-brand'}`}>{item.name}</Link></li>
          ))}
        </ul>
      </div>
      <ProductListing basePath={`/c/${slug}`} query={query} />
    </div>
  );
}
