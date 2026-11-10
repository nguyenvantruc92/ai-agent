import Link from 'next/link';
import { Garment } from '@/components/shop/garment';
import { Badge } from '@/components/ui/badge';
import type { StoreCard } from '@/features/catalog/queries';
import { colorDot } from '@/lib/colors';
import { formatVnd } from '@/lib/format';

// Pastel backdrops for products that have no photo yet (stable per category).
const tones = [
  'from-[#ede9fe] to-[#fae8ff]', 'from-[#e0e7ff] to-[#ede9fe]', 'from-[#fce7f3] to-[#fae8ff]',
  'from-[#dbeafe] to-[#e0e7ff]', 'from-[#ccfbf1] to-[#dbeafe]', 'from-[#fef3c7] to-[#fce7f3]',
];
export const toneFor = (key: string) => tones[[...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
const MAX_DOTS = 5;

export function discountPercent(price: number, compareAt: number | null) {
  return compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
}

export function ProductCard({ product, priority = false }: { product: StoreCard; priority?: boolean }) {
  const discount = discountPercent(product.priceVnd, product.compareAtPriceVnd);
  const dots = product.colors.map((name) => ({ name, hex: colorDot(name) })).filter((dot): dot is { name: string; hex: string } => Boolean(dot.hex));
  return (
    <article className="group h-full">
      <Link href={`/p/${product.slug}`} className="flex h-full flex-col rounded-2xl outline-offset-4" aria-label={product.name}>
        <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-line transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-card ${product.imageUrl ? 'from-sand to-sand' : toneFor(product.categorySlug)}`}>
          {product.imageUrl
            // eslint-disable-next-line @next/next/no-img-element -- small local files served with immutable caching
            ? <img src={product.imageUrl} alt="" loading={priority ? 'eager' : 'lazy'} className={`size-full object-cover transition-transform duration-500 group-hover:scale-105 ${product.soldOut ? 'opacity-60 grayscale' : ''}`} />
            : <Garment className="absolute inset-[24%] text-brand/20 transition-transform duration-500 group-hover:scale-110" />}
          <span className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
            {product.soldOut ? <Badge tone="dark">Hết hàng</Badge>
              : discount ? <Badge tone="sale-solid">-{discount}%</Badge>
              : product.isNew ? <Badge tone="brand-solid">Mới</Badge> : null}
            {!product.soldOut && product.lowStock && <Badge tone="warn">Sắp hết</Badge>}
          </span>
        </div>
        <div className="mt-3.5 flex flex-1 flex-col gap-1.5 px-0.5">
          <p className="text-[11px] font-semibold tracking-wider text-brand uppercase">{product.categoryName}</p>
          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-ink transition-colors group-hover:text-brand">{product.name}</h3>
          <p className="mt-auto flex items-baseline gap-2 pt-1">
            <span className={`text-lg font-bold tabular-nums ${discount ? 'text-sale' : 'text-ink'}`}>{formatVnd(product.priceVnd)}</span>
            {discount > 0 && product.compareAtPriceVnd && <s className="text-sm text-ink-muted tabular-nums">{formatVnd(product.compareAtPriceVnd)}</s>}
          </p>
          <div className="flex min-h-5 items-center justify-between gap-2">
            {dots.length > 0 && (
              <span className="flex items-center gap-1" aria-label={`Màu: ${product.colors.join(', ')}`}>
                {dots.slice(0, MAX_DOTS).map((dot) => <span key={dot.name} title={dot.name} className="size-3.5 rounded-full border border-ink/15" style={{ background: dot.hex }} />)}
                {dots.length > MAX_DOTS && <span className="text-xs text-ink-muted">+{dots.length - MAX_DOTS}</span>}
              </span>
            )}
            {product.sizes.length > 0 && <span className="truncate text-xs text-ink-muted">{product.sizes.join(' · ')}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function ProductGrid({ products }: { products: StoreCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}
    </div>
  );
}
