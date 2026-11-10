import { NextResponse } from 'next/server';
import { visitorSession } from '@/features/chat/visitor';
import { getCustomerOrder } from '@/features/orders/customer-orders';
import { apiError } from '@/lib/http';

type Context = { params: Promise<{ code: string }> };

/** An order placed from this browser. Others must use /api/orders/lookup with the phone number. */
export async function GET(_: Request, { params }: Context) {
  try {
    const session = await visitorSession();
    return NextResponse.json(await getCustomerOrder((await params).code, { visitorId: session.isNew ? undefined : session.visitorId }));
  } catch (error) { return apiError(error); }
}
