import { visitorSession } from '@/features/chat/visitor';
import { addToCartInput } from '@/features/orders/customer-schemas';
import { addToCart, getCart } from '@/features/shop/cart';
import { apiError } from '@/lib/http';
import { guardWrite, withVisitor } from '@/lib/shop-api';

/** Body: { variantId, quantity? } — adds to the cart and returns it. */
export async function POST(request: Request) {
  try {
    guardWrite(request, 'cart');
    const session = await visitorSession();
    await addToCart(session.visitorId, addToCartInput.parse(await request.json()));
    return withVisitor(session, await getCart(session.visitorId), { status: 201 });
  } catch (error) { return apiError(error); }
}
