import { NextResponse } from 'next/server';
import { visitorSession } from '@/features/chat/visitor';
import { payCustomerOrder } from '@/features/orders/customer-orders';
import { payInput } from '@/features/orders/customer-schemas';
import { apiError } from '@/lib/http';
import { guardWrite } from '@/lib/shop-api';

type Context = { params: Promise<{ code: string }> };

/** Simulated payment gateway callback. Body: { outcome: 'success' | 'failure', phone? }. */
export async function POST(request: Request, { params }: Context) {
  try {
    guardWrite(request, 'order-action', 20, 60);
    const session = await visitorSession();
    const { outcome, phone } = payInput.parse(await request.json());
    return NextResponse.json(await payCustomerOrder((await params).code, { visitorId: session.isNew ? undefined : session.visitorId, phone }, outcome));
  } catch (error) { return apiError(error); }
}
