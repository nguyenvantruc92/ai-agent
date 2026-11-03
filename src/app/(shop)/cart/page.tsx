import { CartView } from '@/components/shop/cart-view';
import { visitorSession } from '@/features/chat/visitor';
import { getCart } from '@/features/shop/cart';

export const metadata = { title: 'Giỏ hàng', robots: { index: false } };

export default async function CartPage() {
  const session = await visitorSession();
  const cart = await getCart(session.isNew ? undefined : session.visitorId);
  return (
    <div className="py-10">
      <h1 className="mb-8 font-display text-4xl tracking-tight">Giỏ hàng</h1>
      <CartView cart={cart} />
    </div>
  );
}
