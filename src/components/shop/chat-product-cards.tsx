import Link from 'next/link';
import { Garment } from '@/components/shop/garment';
import { discountPercent, toneFor } from '@/components/shop/product-card';
import type { StoreCard } from '@/features/catalog/queries';
import { formatVnd } from '@/lib/format';

/**
 * Products the assistant recommends, as small boxes under its answer. Each box opens the product page; `onOpen` lets the
 * widget get out of the way (on a phone the chat covers the whole screen).
 */
export function ChatProductCards({ products, onOpen }: { products: StoreCard[]; onOpen: () => void }) {
  if (!products.length) return null;
  const single = products.length === 1;
  return (
    <ul
      aria-label="Sản phẩm gợi ý"
      className={single ? 'mt-3' : '-mx-1 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1.5'}
    >
      {products.map((product) => {
        const discount = discountPercent(product.priceVnd, product.compareAtPriceVnd);
        return (
          <li key={product.id} className={single ? '' : 'w-36 shrink-0 snap-start'}>
            <Link
              href={`/p/${product.slug}`}
              onClick={onOpen}
              className={`group flex overflow-hidden rounded-xl bg-white ring-1 ring-line transition-shadow hover:shadow-card hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${single ? 'flex-row' : 'h-full flex-col'}`}
            >
              <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br ${product.imageUrl ? 'from-sand to-sand' : toneFor(product.categorySlug)} ${single ? 'w-24 self-stretch' : 'aspect-[4/5] w-full'}`}>
                {product.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element -- small local files served with immutable caching
                  ? <img src={product.imageUrl} alt="" loading="lazy" className={`size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 ${product.soldOut ? 'opacity-60 grayscale' : ''}`} />
                  : <Garment className="absolute inset-[24%] text-brand/20" />}
                {product.soldOut
                  ? <span className="absolute top-1.5 left-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Hết hàng</span>
                  : discount > 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-sale px-2 py-0.5 text-[10px] font-semibold text-white">-{discount}%</span>}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
                <p className="text-[10px] font-semibold tracking-wider text-brand uppercase">{product.categoryName}</p>
                <h3 className="line-clamp-2 text-[13px] leading-snug font-medium text-ink group-hover:text-brand">{product.name}</h3>
                <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-0.5">
                  <span className={`text-sm font-bold tabular-nums ${discount ? 'text-sale' : 'text-ink'}`}>{formatVnd(product.priceVnd)}</span>
                  {discount > 0 && product.compareAtPriceVnd && <s className="text-[11px] text-ink-muted tabular-nums">{formatVnd(product.compareAtPriceVnd)}</s>}
                </p>
                {product.sizes.length > 0 && <p className="truncate text-[11px] text-ink-muted">Size {product.sizes.join(' · ')}</p>}
                <span className="mt-0.5 text-[11px] font-semibold text-brand">Xem chi tiết →</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
