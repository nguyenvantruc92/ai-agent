import { NextResponse } from 'next/server';
import { transitionOrder } from '@/features/orders/admin-orders';
import { transitionInput } from '@/features/orders/admin-schemas';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ code: string }> };

/** Body: { action: 'ship' | 'deliver' | 'cancel', note? }. Invalid transitions answer 409 with the reason. */
export async function POST(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { action, note } = transitionInput.parse(await request.json());
    return NextResponse.json(await transitionOrder((await params).code, action, note));
  } catch (error) { return apiError(error); }
}
