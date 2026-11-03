import { NextResponse } from 'next/server';
import { getAdminOrder } from '@/features/orders/admin-orders';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ code: string }> };

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await getAdminOrder((await params).code)); } catch (error) { return apiError(error); }
}
