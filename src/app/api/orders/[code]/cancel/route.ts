import { NextResponse } from 'next/server';
import { visitorSession } from '@/features/chat/visitor';
import { cancelCustomerOrder } from '@/features/orders/customer-orders';
import { orderActionInput } from '@/features/orders/customer-schemas';
import { apiError } from '@/lib/http';
import { guardWrite, readOptionalJson } from '@/lib/shop-api';

type Context = { params: Promise<{ code: string }> };

/** Body (optional): { phone } when the order was not placed from this browser. */
export async function POST(request: Request, { params }: Context) {
  try {
    await guardWrite(request, 'order-action', 20, 60);
    const session = await visitorSession();
    const { phone } = orderActionInput.parse(await readOptionalJson(request));
    return NextResponse.json(await cancelCustomerOrder((await params).code, { visitorId: session.isNew ? undefined : session.visitorId, phone }));
  } catch (error) { return apiError(error); }
}
