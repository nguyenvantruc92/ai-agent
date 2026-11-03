import type { TransactionSql } from 'postgres';
import { sql } from '@/db/client';
import { syncCatalog } from '@/features/catalog/sync';
import type { OrderListQuery } from '@/features/orders/admin-schemas';
import { checkTransition, type OrderAction, type OrderStatus, type PaymentStatus } from '@/features/orders/order-flow';
import { recordOrderEvent, restockOrder } from '@/features/orders/order-ops';
import { audit } from '@/features/orders/repository';
import { HttpError } from '@/lib/http';
import { randomUUID } from 'node:crypto';

const TZ = 'Asia/Ho_Chi_Minh';
const likeEscape = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export type AdminOrderListItem = {
  code: string; customerName: string; phone: string; status: OrderStatus; paymentMethod: string; paymentStatus: PaymentStatus;
  totalVnd: number; itemCount: number; orderedAt: string;
};

const listColumns = sql`
  o.id AS code, coalesce(o.customer_name, '') AS "customerName", coalesce(o.phone, '') AS phone, o.status, o.payment_method AS "paymentMethod",
  o.payment_status AS "paymentStatus", o.total_vnd AS "totalVnd", o.ordered_at AS "orderedAt",
  coalesce((SELECT sum(i.quantity) FROM order_items i WHERE i.order_id = o.id), 0)::int AS "itemCount"
`;
const withIso = <T extends { orderedAt: Date | string }>(row: T) => ({ ...row, orderedAt: new Date(row.orderedAt).toISOString() });

export async function listAdminOrders(query: OrderListQuery) {
  const conditions = [sql`true`];
  if (query.status) conditions.push(sql`o.status = ${query.status}`);
  if (query.payment) conditions.push(sql`o.payment_status = ${query.payment}`);
  if (query.q) {
    const pattern = `%${likeEscape(query.q)}%`;
    conditions.push(sql`(o.id ILIKE ${pattern} OR o.phone LIKE ${pattern} OR unaccent(lower(coalesce(o.customer_name, ''))) LIKE unaccent(lower(${pattern})))`);
  }
  if (query.from) conditions.push(sql`(o.ordered_at AT TIME ZONE ${TZ})::date >= ${query.from}::date`);
  if (query.to) conditions.push(sql`(o.ordered_at AT TIME ZONE ${TZ})::date <= ${query.to}::date`);
  const where = conditions.reduce((all, part) => sql`${all} AND ${part}`);

  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM orders o WHERE ${where}`;
  const rows = await sql<(Omit<AdminOrderListItem, 'orderedAt'> & { orderedAt: Date })[]>`
    SELECT ${listColumns} FROM orders o WHERE ${where}
    ORDER BY o.ordered_at DESC, o.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
  `;
  return { items: rows.map(withIso) as AdminOrderListItem[], total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function adminOrderCounts() {
  const [row] = await sql<{ all: number; processing: number; shipping: number; delivered: number; cancelled: number }[]>`
    SELECT count(*)::int AS "all", count(*) FILTER (WHERE status = 'processing')::int AS processing, count(*) FILTER (WHERE status = 'shipping')::int AS shipping,
      count(*) FILTER (WHERE status = 'delivered')::int AS delivered, count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM orders`;
  return row;
}

export type AdminOrderDetail = {
  code: string; status: OrderStatus; paymentMethod: string; paymentStatus: PaymentStatus; orderedAt: string; deliveredAt: string | null; cancelledAt: string | null;
  customerName: string; phone: string; address: string; note: string; subtotalVnd: number; shippingFeeVnd: number; totalVnd: number;
  items: { productCode: string; slug: string | null; name: string; size: string; color: string; quantity: number; unitPriceVnd: number; discountPercent: number }[];
  payments: { id: string; method: string; status: string; amountVnd: number; providerRef: string | null; createdAt: string }[];
  events: { id: string; type: string; actor: string; from: string | null; to: string | null; note: string; createdAt: string }[];
  requests: { id: string; type: string; productCode: string; requestedSize: string | null; reason: string | null; status: string; createdAt: string }[];
  pendingApprovals: number;
};

export async function getAdminOrder(code: string): Promise<AdminOrderDetail> {
  const id = code.trim().toUpperCase();
  const [row] = await sql<{
    id: string; status: OrderStatus; payment_method: string; payment_status: PaymentStatus; ordered_at: Date; delivered_at: Date | null; cancelled_at: Date | null;
    customer_name: string | null; phone: string | null; address: string | null; note: string; subtotal_vnd: number; shipping_fee_vnd: number; total_vnd: number;
  }[]>`SELECT id, status, payment_method, payment_status, ordered_at, delivered_at, cancelled_at, customer_name, phone, address, note, subtotal_vnd, shipping_fee_vnd, total_vnd FROM orders WHERE id = ${id}`;
  if (!row) throw new HttpError('Không tìm thấy đơn hàng.', 404);
  const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
  const [items, payments, events, requests, [{ pending }]] = await Promise.all([
    sql<{ product_id: string; slug: string | null; product_name: string; size: string; color: string; quantity: number; unit_price_vnd: number; discount_percent: number }[]>`
      SELECT oi.product_id, p.slug, oi.product_name, oi.size, oi.color, oi.quantity, oi.unit_price_vnd, oi.discount_percent
      FROM order_items oi LEFT JOIN products p ON p.code = oi.product_id WHERE oi.order_id = ${id} ORDER BY oi.product_id, oi.size, oi.color`,
    sql<{ id: string; method: string; status: string; amount_vnd: number; provider_ref: string | null; created_at: Date }[]>`SELECT id, method, status, amount_vnd, provider_ref, created_at FROM payments WHERE order_id = ${id} ORDER BY created_at`,
    sql<{ id: string; type: string; actor: string; from_status: string | null; to_status: string | null; note: string; created_at: Date }[]>`SELECT id, type, actor, from_status, to_status, note, created_at FROM order_events WHERE order_id = ${id} ORDER BY created_at, id`,
    sql<{ id: string; type: string; product_id: string; requested_size: string | null; reason: string | null; status: string; created_at: Date }[]>`SELECT id, type, product_id, requested_size, reason, status, created_at FROM exchange_return_requests WHERE order_id = ${id} ORDER BY created_at`,
    sql<{ pending: number }[]>`SELECT count(*)::int AS pending FROM approval_requests WHERE payload->>'orderId' = ${id} AND status = 'pending'`,
  ]);
  return {
    code: row.id, status: row.status, paymentMethod: row.payment_method, paymentStatus: row.payment_status, orderedAt: iso(row.ordered_at)!, deliveredAt: iso(row.delivered_at), cancelledAt: iso(row.cancelled_at),
    customerName: row.customer_name ?? '', phone: row.phone ?? '', address: row.address ?? '', note: row.note, subtotalVnd: row.subtotal_vnd, shippingFeeVnd: row.shipping_fee_vnd, totalVnd: row.total_vnd,
    items: items.map((item) => ({ productCode: item.product_id, slug: item.slug, name: item.product_name, size: item.size, color: item.color, quantity: item.quantity, unitPriceVnd: item.unit_price_vnd, discountPercent: item.discount_percent })),
    payments: payments.map((payment) => ({ id: payment.id, method: payment.method, status: payment.status, amountVnd: payment.amount_vnd, providerRef: payment.provider_ref, createdAt: iso(payment.created_at)! })),
    events: events.map((event) => ({ id: event.id, type: event.type, actor: event.actor, from: event.from_status, to: event.to_status, note: event.note, createdAt: iso(event.created_at)! })),
    requests: requests.map((request) => ({ id: request.id, type: request.type, productCode: request.product_id, requestedSize: request.requested_size, reason: request.reason, status: request.status, createdAt: iso(request.created_at)! })),
    pendingApprovals: pending,
  };
}

async function settleCodCollection(tx: TransactionSql, orderId: string, method: string, totalVnd: number) {
  await tx`UPDATE orders SET payment_status = 'paid' WHERE id = ${orderId}`;
  await tx`INSERT INTO payments (id, order_id, method, status, amount_vnd, provider_ref) VALUES (${randomUUID()}, ${orderId}, ${method}, 'succeeded', ${totalVnd}, 'COD-COLLECTED')`;
  await recordOrderEvent(tx, orderId, { type: 'cod_collected', actor: 'admin', note: 'Đã thu tiền khi giao hàng' });
}

/**
 * Staff move an order through its life. All effects of one action (status, timestamps, payments, stock,
 * timeline) commit together, and the row is locked so two staff members cannot act on it at once.
 */
export async function transitionOrder(code: string, action: OrderAction, note = '') {
  const id = code.trim().toUpperCase();
  const outcome = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; status: OrderStatus; payment_method: string; payment_status: PaymentStatus; total_vnd: number }[]>`
      SELECT id, status, payment_method, payment_status, total_vnd FROM orders WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError('Không tìm thấy đơn hàng.', 404);
    const check = checkTransition({ status: row.status, paymentMethod: row.payment_method, paymentStatus: row.payment_status }, action);
    if (!check.ok) throw new HttpError(check.message, 409);

    if (action === 'ship') {
      await tx`UPDATE orders SET status = 'shipping' WHERE id = ${id}`;
      await recordOrderEvent(tx, id, { type: 'shipped', actor: 'admin', from: row.status, to: 'shipping', note });
    } else if (action === 'deliver') {
      await tx`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = ${id}`;
      await recordOrderEvent(tx, id, { type: 'delivered', actor: 'admin', from: row.status, to: 'delivered', note });
      if (row.payment_method === 'COD' && row.payment_status !== 'paid') await settleCodCollection(tx, id, row.payment_method, row.total_vnd);
    } else {
      const restocked = await restockOrder(tx, id);
      const refund = row.payment_status === 'paid';
      await tx`UPDATE orders SET status = 'cancelled', cancelled_at = now(), payment_status = ${refund ? 'refunded' : row.payment_status} WHERE id = ${id}`;
      await tx`UPDATE payments SET status = 'refunded', updated_at = now() WHERE order_id = ${id} AND status = 'succeeded'`;
      await tx`UPDATE payments SET status = 'failed', updated_at = now() WHERE order_id = ${id} AND status = 'pending'`;
      await recordOrderEvent(tx, id, { type: 'cancelled', actor: 'admin', from: row.status, to: 'cancelled', note });
      if (refund) await recordOrderEvent(tx, id, { type: 'refunded', actor: 'admin', note: 'Hoàn tiền (giả lập)' });
      return { restocked: restocked > 0 };
    }
    return { restocked: false };
  });
  await audit('admin', `order.${action}`, 'order', id, { note });
  if (outcome.restocked) await syncCatalog();
  return getAdminOrder(id);
}

/** Dashboard numbers. "Revenue" is the total of paid, non-cancelled orders, grouped by order day (Vietnam time). */
export async function getOrderStats(days = 14) {
  const [summary, byDay, recent] = await Promise.all([
    sql<{ processing: number; today: number; revenue30: number; orders30: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'processing')::int AS processing,
        count(*) FILTER (WHERE (ordered_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date)::int AS today,
        coalesce(sum(total_vnd) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled' AND ordered_at > now() - interval '30 days'), 0)::float8 AS revenue30,
        count(*) FILTER (WHERE status <> 'cancelled' AND ordered_at > now() - interval '30 days')::int AS orders30
      FROM orders`,
    sql<{ date: string; revenueVnd: number; orders: number }[]>`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
        coalesce(sum(o.total_vnd) FILTER (WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'), 0)::float8 AS "revenueVnd",
        count(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders
      FROM generate_series((now() AT TIME ZONE ${TZ})::date - ${days - 1}::int, (now() AT TIME ZONE ${TZ})::date, interval '1 day') AS d(day)
      LEFT JOIN orders o ON (o.ordered_at AT TIME ZONE ${TZ})::date = d.day::date
      GROUP BY d.day ORDER BY d.day`,
    sql<(Omit<AdminOrderListItem, 'orderedAt'> & { orderedAt: Date })[]>`SELECT ${listColumns} FROM orders o ORDER BY o.ordered_at DESC, o.id DESC LIMIT 6`,
  ]);
  return { ...summary[0], byDay, recent: recent.map(withIso) as AdminOrderListItem[] };
}
