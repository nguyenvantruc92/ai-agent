import { ChatWidget } from '@/components/shop/chat-widget';
import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';

export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4">{children}</main>
      <SiteFooter />
      <ChatWidget />
    </div>
  );
}
