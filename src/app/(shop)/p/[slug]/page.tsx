import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGallery } from '@/components/shop/product-gallery';
import { ProductGrid, discountPercent } from '@/components/shop/product-card';
import { VariantPicker } from '@/components/shop/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { getStoreProduct, listRelatedProducts } from '@/features/catalog/queries';
import { HttpError } from '@/lib/http';
import { getShopSettings } from '@/features/shop/settings';
import { formatVnd } from '@/lib/format';

type Props = { params: Promise<{ slug: string }> };

const load = (slug: string) => getStoreProduct(slug.toLowerCase()).catch((error) => { if (error instanceof HttpError && error.status === 404) return null; throw error; });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).slug);
  if (!product) return {};
  return { title: product.name, description: product.description || `${product.name} ${formatVnd(product.priceVnd)}`, openGraph: { images: product.images[0] ? [product.images[0].url] : undefined } };
}

export default async function ProductPage({ params }: Props) {
  const product = await load((await params).slug);
  if (!product) notFound();
  const [related, settings] = await Promise.all([listRelatedProducts(product.categorySlug, product.id), getShopSettings()]);
  const discount = discountPercent(product.priceVnd, product.compareAtPriceVnd);

  return (
    <div className="py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">Trang chủ</Link> / <Link href={`/c/${product.categorySlug}`} className="hover:text-ink">{product.categoryName}</Link> / <span className="text-ink">{product.name}</span>
      </nav>
      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />
        <div className="space-y-6">
          <div>
            <p className="mb-1 text-xs tracking-wider text-ink-muted uppercase">{product.categoryName} · {product.code}</p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3"><Price value={product.priceVnd} oldValue={product.compareAtPriceVnd} size="lg" />{discount > 0 && <Badge tone="sale">-{discount}%</Badge>}{product.soldOut && <Badge>Hết hàng</Badge>}</div>
          </div>
          {product.description && <p className="leading-relaxed text-ink-soft">{product.description}</p>}
          <VariantPicker variants={product.variants} sizes={product.sizes} colors={product.colors} productName={product.name} />
          <dl className="divide-y divide-line rounded-2xl border border-line bg-sand/40 text-sm">
            {product.material && <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-ink-muted">Chất liệu</dt><dd className="text-right">{product.material}</dd></div>}
            <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-ink-muted">Giao hàng</dt><dd className="text-right">Miễn phí từ {formatVnd(settings.freeShippingFromVnd)}, dưới mức đó {formatVnd(settings.shippingFeeVnd)}</dd></div>
            <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-ink-muted">Đổi size</dt><dd className="text-right">Trong 7 ngày kể từ ngày nhận</dd></div>
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="related">
          <h2 id="related" className="mb-6 font-display text-2xl tracking-tight">Có thể bạn thích</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
