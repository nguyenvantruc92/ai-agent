import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { OpenChatButton } from '@/components/shop/chat-widget';
import { MobileMenu } from '@/components/shop/mobile-menu';
import { visitorSession } from '@/features/chat/visitor';
import { listStoreCategories } from '@/features/catalog/queries';
import { cartCount } from '@/features/shop/cart';
import { getShopSettings } from '@/features/shop/settings';
import { formatVnd } from '@/lib/format';

export async function SiteHeader() {
  const session = await visitorSession();
  const [categories, settings, count] = await Promise.all([listStoreCategories(), getShopSettings(), cartCount(session.isNew ? undefined : session.visitorId)]);
  const nav = categories.filter((category) => category.productCount > 0);
  const items = [{ href: '/', label: 'Trang chủ' }, ...nav.map((category) => ({ href: `/c/${category.slug}`, label: category.name }))];
  return (
    <>
      <div className="bg-gradient-to-r from-brand via-[#a855f7] to-accent px-4 py-2 text-center text-xs font-medium text-white">
        Miễn phí giao hàng từ {formatVnd(settings.freeShippingFromVnd)} <span className="mx-2 opacity-40">|</span> Đổi size trong 7 ngày
      </div>
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 shadow-[0_1px_0_rgb(124_58_237/0.04)] backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <MobileMenu items={items} />
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-[0.14em] text-ink"><LogoMark className="size-8" />TOMODEV</Link>
          <nav aria-label="Danh mục" className="ml-2 hidden gap-5 text-sm text-ink-soft md:flex">
            {nav.slice(0, 6).map((category, index) => <Link key={category.id} href={`/c/${category.slug}`} className={`whitespace-nowrap font-medium transition-colors hover:text-brand ${index >= 5 ? 'hidden 2xl:block' : index >= 4 ? 'hidden xl:block' : ''}`}>{category.name}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <form action="/search" role="search" className="relative hidden sm:block">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" /></svg>
              <input name="q" type="search" placeholder="Tìm sản phẩm…" aria-label="Tìm sản phẩm" className="h-9 w-40 rounded-full lg:w-48 2xl:w-56 border border-line bg-sand/60 pr-3 pl-9 text-sm placeholder:text-ink-muted focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20 focus:outline-none" />
            </form>
            <Link href="/search" aria-label="Tìm kiếm" className="grid size-10 place-items-center rounded-full hover:bg-sand sm:hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="size-5" aria-hidden><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" /></svg>
            </Link>
            <Link href="/orders/lookup" className="hidden h-9 items-center rounded-full px-3 text-sm whitespace-nowrap text-ink-soft hover:bg-sand hover:text-brand 2xl:inline-flex">Tra cứu đơn</Link>
            <Link href="/cart" aria-label={count ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng'} className="relative grid size-10 place-items-center rounded-full hover:bg-sand hover:text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden><path d="M6 7h12l1 13H5L6 7Zm3 0a3 3 0 1 1 6 0" /></svg>
              {count > 0 && <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-4 font-semibold text-white">{count}</span>}
            </Link>
            <OpenChatButton className="hidden h-9 items-center gap-2 sm:inline-flex rounded-full bg-gradient-to-r from-brand to-accent px-4 text-sm font-semibold whitespace-nowrap text-white shadow-sm shadow-brand/30 hover:brightness-110">✦ Trợ lý AI</OpenChatButton>
          </div>
        </div>
      </header>
    </>
  );
}
