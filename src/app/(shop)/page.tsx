import Link from 'next/link';
import { OpenChatButton } from '@/components/shop/chat-widget';
import { Garment } from '@/components/shop/garment';
import { ProductGrid } from '@/components/shop/product-card';
import { buttonClass } from '@/components/ui/button';
import { listStoreCategories, listStoreProducts } from '@/features/catalog/queries';
import { storeListQuery } from '@/features/catalog/schemas';
import { getShopSettings } from '@/features/shop/settings';
import { formatVnd } from '@/lib/format';

export const metadata = { title: { absolute: 'Tomodev Fashion — thời trang nam trẻ trung' } };

// Category tile backdrops: soft pastel gradients that stay on-brand.
const tones = [
  'from-[#c4b5fd] to-[#ede9fe]', 'from-[#f9a8d4] to-[#fce7f3]', 'from-[#93c5fd] to-[#dbeafe]', 'from-[#5eead4] to-[#ccfbf1]',
  'from-[#fcd34d] to-[#fef3c7]', 'from-[#a5b4fc] to-[#e0e7ff]', 'from-[#f0abfc] to-[#fae8ff]', 'from-[#86efac] to-[#dcfce7]',
];

function Heading({ id, eyebrow, title, href, link }: { id: string; eyebrow: string; title: string; href?: string; link?: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-brand uppercase">{eyebrow}</p>
        <h2 id={id} className="font-display mt-1 text-3xl text-ink">{title}</h2>
      </div>
      {href && <Link href={href} className="shrink-0 text-sm font-semibold text-brand hover:underline">{link ?? 'Xem tất cả'} →</Link>}
    </div>
  );
}

export default async function HomePage() {
  const [categories, arrivals, sale, settings] = await Promise.all([
    listStoreCategories(),
    listStoreProducts(storeListQuery.parse({ sort: 'newest', pageSize: 8 })),
    listStoreProducts(storeListQuery.parse({ onSale: true, sort: 'price_asc', pageSize: 4 })),
    getShopSettings(),
  ]);
  const shown = categories.filter((category) => category.productCount > 0).slice(0, 8);

  return (
    <>
      <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f1e9ff] via-white to-[#ffe4f1] px-6 py-12 sm:px-12 md:py-20">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-gradient-to-br from-brand/30 to-accent/20 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold tracking-wider text-brand uppercase shadow-sm ring-1 ring-line">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />Bộ sưu tập mới
            </span>
            <h1 className="font-display mt-5 text-5xl leading-[1.05] text-ink sm:text-6xl lg:text-7xl">Mặc đẹp,<br /><span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">sống trẻ.</span></h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">Sơ mi, polo, chinos và phụ kiện cho nam: chất liệu dễ chịu, form chuẩn, đổi size miễn phí trong 7 ngày.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#moi" className={buttonClass({ variant: 'primary', size: 'lg' })}>Mua ngay</a>
              <OpenChatButton className={buttonClass({ variant: 'outline', size: 'lg' })}>✦ Hỏi trợ lý AI</OpenChatButton>
            </div>
          </div>
          <div className="relative mx-auto hidden aspect-square w-full max-w-md md:block" aria-hidden>
            <div className="absolute inset-[8%] rounded-[2.5rem] bg-gradient-to-br from-brand to-[#a855f7] shadow-card" />
            <Garment className="absolute inset-[24%] text-white/90 drop-shadow-lg" />
            <div className="absolute top-2 left-0 grid size-24 -rotate-6 place-items-center rounded-3xl bg-white text-center shadow-card ring-1 ring-line"><span><b className="block text-xl text-brand">NEW</b><span className="text-[11px] text-ink-muted">Mới về</span></span></div>
            <div className="absolute right-0 bottom-6 rounded-2xl bg-white px-4 py-3 shadow-card ring-1 ring-line"><p className="text-[11px] text-ink-muted">Giao hàng</p><p className="text-sm font-bold text-ink">Miễn phí từ {formatVnd(settings.freeShippingFromVnd)}</p></div>
            <div className="absolute bottom-0 left-8 size-12 rounded-full bg-accent shadow-card" />
          </div>
        </div>
      </section>

      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ['🚚', 'Giao nhanh toàn quốc', `Miễn phí từ ${formatVnd(settings.freeShippingFromVnd)}`],
          ['🔄', 'Đổi size dễ dàng', 'Trong 7 ngày kể từ khi nhận'],
          ['💳', 'Thanh toán linh hoạt', 'COD, chuyển khoản hoặc thẻ'],
        ].map(([icon, title, hint]) => (
          <li key={title} className="flex items-center gap-4 rounded-2xl bg-sand/70 p-4 ring-1 ring-line"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm" aria-hidden>{icon}</span><div><p className="text-sm font-bold">{title}</p><p className="text-xs text-ink-soft">{hint}</p></div></li>
        ))}
      </ul>

      {shown.length > 0 && (
        <section className="pt-16" aria-labelledby="danh-muc">
          <Heading id="danh-muc" eyebrow="Khám phá" title="Mua theo danh mục" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {shown.map((category, index) => (
              <Link key={category.id} href={`/c/${category.slug}`} className="group relative aspect-[4/5] overflow-hidden rounded-3xl ring-1 ring-line">
                <div className={`absolute inset-0 bg-gradient-to-br ${tones[index % tones.length]} transition-transform duration-500 group-hover:scale-105`} />
                <Garment className="absolute inset-[26%] text-white/70 transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent p-4 pt-10 text-white"><p className="text-lg font-bold">{category.name}</p><p className="text-xs text-white/80">{category.productCount} sản phẩm</p></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="moi" className="scroll-mt-24 pt-16" aria-labelledby="moi-title">
        <Heading id="moi-title" eyebrow="Vừa lên kệ" title="Sản phẩm mới" href="/search?q=" link="Tìm kiếm" />
        {arrivals.items.length ? <ProductGrid products={arrivals.items} /> : <p className="rounded-2xl border border-dashed border-line py-12 text-center text-ink-soft">Cửa hàng đang cập nhật sản phẩm. Quay lại sau nhé!</p>}
      </section>

      {sale.items.length > 0 && (
        <section className="pt-16" aria-labelledby="giam-gia">
          <Heading id="giam-gia" eyebrow="Săn deal" title="Đang giảm giá" href="/search?onSale=true&q=%20" />
          <ProductGrid products={sale.items} />
        </section>
      )}

      <section className="relative mt-20 overflow-hidden rounded-[2rem] bg-gradient-to-r from-brand via-[#9333ea] to-accent px-6 py-12 text-center text-white sm:px-12">
        <div className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -right-8 -bottom-20 size-64 rounded-full bg-white/10" aria-hidden />
        <h2 className="font-display relative text-3xl sm:text-4xl">Không chắc chọn size nào?</h2>
        <p className="relative mx-auto mt-3 max-w-lg text-white/85">Trợ lý AI tư vấn size, chất liệu, chính sách đổi trả và tra cứu đơn hàng giúp bạn.</p>
        <OpenChatButton className="relative mt-7 inline-flex h-12 items-center rounded-xl bg-white px-7 font-bold text-brand shadow-lg hover:bg-sand">Trò chuyện ngay →</OpenChatButton>
      </section>
    </>
  );
}
