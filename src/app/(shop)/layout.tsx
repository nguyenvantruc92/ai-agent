import { ChatWidget } from '@/components/shop/chat-widget';
import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';

export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader />
      {/* flex-1 pushes the footer to the bottom of the viewport when the page content is short */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>
      <SiteFooter />
      <ChatWidget />
    </div>
  );
}
