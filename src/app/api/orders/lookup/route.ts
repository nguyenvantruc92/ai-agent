import { NextResponse } from 'next/server';
import { lookupCustomerOrder } from '@/features/orders/customer-orders';
import { lookupInput } from '@/features/orders/customer-schemas';
import { apiError } from '@/lib/http';
import { clientIp } from '@/lib/rate-limit';
import { guardWrite } from '@/lib/shop-api';

/** Body: { code, phone }. Wrong combinations are throttled and always answer with the same message. */
export async function POST(request: Request) {
  try {
    guardWrite(request, 'lookup', 30, 60);
    const { code, phone } = lookupInput.parse(await request.json());
    return NextResponse.json(await lookupCustomerOrder(code, phone, clientIp(request)));
  } catch (error) { return apiError(error); }
}
