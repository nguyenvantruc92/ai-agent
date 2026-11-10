import { z } from 'zod';
import { visitorSession } from '@/features/chat/visitor';
import { lineQuantityInput } from '@/features/orders/customer-schemas';
import { getCart, removeLine, setLineQuantity } from '@/features/shop/cart';
import { apiError } from '@/lib/http';
import { guardWrite, withVisitor } from '@/lib/shop-api';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function PATCH(request: Request, { params }: Context) {
  try {
    await guardWrite(request, 'cart');
    const session = await visitorSession();
    await setLineQuantity(session.visitorId, idSchema.parse((await params).id), lineQuantityInput.parse(await request.json()).quantity);
    return withVisitor(session, await getCart(session.visitorId));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    await guardWrite(request, 'cart');
    const session = await visitorSession();
    await removeLine(session.visitorId, idSchema.parse((await params).id));
    return withVisitor(session, await getCart(session.visitorId));
  } catch (error) { return apiError(error); }
}
