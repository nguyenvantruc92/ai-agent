import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckoutForm } from '@/components/shop/checkout-form';
import { visitorSession } from '@/features/chat/visitor';
import { getCart } from '@/features/shop/cart';

export const metadata = { title: 'Đặt hàng', robots: { index: false } };

export default async function CheckoutPage() {
  const session = await visitorSession();
  const cart = await getCart(session.isNew ? undefined : session.visitorId);
  if (cart.lines.length === 0) redirect('/cart');
  return (
    <div className="py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted"><Link href="/cart" className="hover:text-ink">Giỏ hàng</Link> / <span className="text-ink">Đặt hàng</span></nav>
      <h1 className="mb-8 font-display text-4xl tracking-tight">Đặt hàng</h1>
      {cart.canCheckout ? <CheckoutForm cart={cart} /> : (
        <div className="rounded-card border border-warn/30 bg-warn-soft px-4 py-6 text-warn">Một số sản phẩm trong giỏ không còn đủ hàng. <Link href="/cart" className="underline">Điều chỉnh giỏ hàng</Link> để tiếp tục.</div>
      )}
    </div>
  );
}
