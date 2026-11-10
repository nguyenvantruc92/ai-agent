import { visitorSession } from '@/features/chat/visitor';
import { checkout } from '@/features/orders/checkout';
import { checkoutInput } from '@/features/orders/customer-schemas';
import { apiError } from '@/lib/http';
import { guardWrite, withVisitor } from '@/lib/shop-api';

/** Places the order from the cart. Safe to retry with the same `idempotencyKey`. */
export async function POST(request: Request) {
  try {
    await guardWrite(request, 'checkout', 10, 60);
    const session = await visitorSession();
    const result = await checkout(session.visitorId, checkoutInput.parse(await request.json()));
    return withVisitor(session, result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return apiError(error); }
}
