import { NextResponse } from 'next/server';
import { visitorSession } from '@/features/chat/visitor';
import { getCart } from '@/features/shop/cart';
import { apiError } from '@/lib/http';

/** The browser's cart. A visitor without a cookie simply has an empty cart (no cookie is created by a read). */
export async function GET() {
  try {
    const session = await visitorSession();
    return NextResponse.json(await getCart(session.isNew ? undefined : session.visitorId));
  } catch (error) { return apiError(error); }
}
