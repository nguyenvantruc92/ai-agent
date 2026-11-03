import { NextResponse } from 'next/server';
import { adminOrderCounts, listAdminOrders } from '@/features/orders/admin-orders';
import { orderListQuery } from '@/features/orders/admin-schemas';
import { apiError, requireAdmin } from '@/lib/http';

/** ?status=&payment=&q=&from=&to=&page=&pageSize= — list plus per-status counts for the tabs. */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const query = orderListQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [list, counts] = await Promise.all([listAdminOrders(query), adminOrderCounts()]);
    return NextResponse.json({ ...list, counts });
  } catch (error) { return apiError(error); }
}
