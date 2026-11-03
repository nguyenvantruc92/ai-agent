import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from '@/db/client';
import { syncCatalog } from '@/features/catalog/sync';
import { isOnline, normalizePhone } from '@/features/orders/customer-schemas';
import { recordOrderEvent, restockOrder } from '@/features/orders/order-ops';
import { audit } from '@/features/orders/repository';
import { HttpError } from '@/lib/http';
import { peekRateLimit, resetRateLimit, takeRateLimit } from '@/lib/rate-limit';

/** Who is asking: the browser that placed the order, or someone who knows the order code AND its phone. */
export type OrderAuth = { visitorId?: string; phone?: string };

export type CustomerOrder = {
  code: string; status: 'processing' | 'shipping' | 'delivered' | 'cancelled'; paymentMethod: string; paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded';
  orderedAt: string; deliveredAt: string | null; customerName: string; phoneMasked: string; address: string; note: string;
  items: { productCode: string; slug: string | null; name: string; size: string; color: string; quantity: number; unitPriceVnd: number; lineTotalVnd: number }[];
  subtotalVnd: number; shippingFeeVnd: number; totalVnd: number; canCancel: boolean; canPay: boolean;
};

const NOT_FOUND = 'Không tìm thấy đơn hàng khớp mã đơn và số điện thoại này.';

type OrderRow = {
  id: string; status: CustomerOrder['status']; payment_method: string; payment_status: CustomerOrder['paymentStatus']; ordered_at: Date; delivered_at: Date | null;
  customer_name: string | null; phone: string | null; address: string | null; note: string; shipping_fee_vnd: number; subtotal_vnd: number; total_vnd: number; visitor_id: string | null;
};

const mask = (phone: string | null) => (phone && phone.length >= 7 ? `${phone.slice(0, 3)}••••${phone.slice(-3)}` : '—');

function authorized(row: OrderRow, auth: OrderAuth) {
  if (auth.visitorId && row.visitor_id && auth.visitorId === row.visitor_id) return true;
  const phone = auth.phone ? normalizePhone(auth.phone) : null;
  return Boolean(phone && row.phone && phone === row.phone);
}

async function present(row: OrderRow): Promise<CustomerOrder> {
  const items = await sql<{ product_id: string; slug: string | null; product_name: string; size: string; color: string; quantity: number; unit_price_vnd: number }[]>`
    SELECT oi.product_id, p.slug, oi.product_name, oi.size, oi.color, oi.quantity, oi.unit_price_vnd
    FROM order_items oi LEFT JOIN products p ON p.code = oi.product_id
    WHERE oi.order_id = ${row.id} ORDER BY oi.product_id, oi.size, oi.color
  `;
  const open = row.status === 'processing' && row.payment_status !== 'paid';
  return {
    code: row.id, status: row.status, paymentMethod: row.payment_method, paymentStatus: row.payment_status,
    orderedAt: new Date(row.ordered_at).toISOString(), deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    customerName: row.customer_name ?? '', phoneMasked: mask(row.phone), address: row.address ?? '', note: row.note,
    items: items.map((item) => ({ productCode: item.product_id, slug: item.slug, name: item.product_name, size: item.size, color: item.color, quantity: item.quantity, unitPriceVnd: item.unit_price_vnd, lineTotalVnd: item.unit_price_vnd * item.quantity })),
    subtotalVnd: row.subtotal_vnd, shippingFeeVnd: row.shipping_fee_vnd, totalVnd: row.total_vnd,
    canCancel: open, canPay: open && isOnline(row.payment_method),
  };
}

const columns = sql`id, status, payment_method, payment_status, ordered_at, delivered_at, customer_name, phone, address, note, shipping_fee_vnd, subtotal_vnd, total_vnd, visitor_id`;

/** 404 for both "no such order" and "not yours", so codes cannot be probed. */
export async function getCustomerOrder(code: string, auth: OrderAuth): Promise<CustomerOrder> {
  const [row] = await sql<OrderRow[]>`SELECT ${columns} FROM orders WHERE id = ${code.trim().toUpperCase()}`;
  if (!row || !authorized(row, auth)) throw new HttpError(NOT_FOUND, 404);
  return present(row);
}

const FAILS_PER_CODE = 5;
const FAILS_PER_PHONE = 10;
const FAILS_PER_IP = 20;
const FAIL_WINDOW_SECONDS = 15 * 60;

/** Order lookup by code + phone with throttling on failures (per code, per phone and per IP). */
export async function lookupCustomerOrder(code: string, phone: string, ip: string): Promise<CustomerOrder> {
  const keys = [[`lookup:code:${code}`, FAILS_PER_CODE], [`lookup:phone:${phone}`, FAILS_PER_PHONE], [`lookup:ip:${ip}`, FAILS_PER_IP]] as const;
  for (const [key, limit] of keys) {
    const blocked = peekRateLimit(key, limit);
    if (!blocked.allowed) throw new HttpError(`Tra cứu sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(blocked.retryAfterSeconds / 60)} phút.`, 429);
  }
  try {
    const order = await getCustomerOrder(code, { phone });
    resetRateLimit(keys[0][0]);
    return order;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) for (const [key, limit] of keys) takeRateLimit(key, limit, FAIL_WINDOW_SECONDS);
    throw error;
  }
}

async function lockedOrder(tx: TransactionSql, code: string, auth: OrderAuth) {
  const [row] = await tx<OrderRow[]>`SELECT ${columns} FROM orders WHERE id = ${code.trim().toUpperCase()} FOR UPDATE`;
  if (!row || !authorized(row, auth)) throw new HttpError(NOT_FOUND, 404);
  return row;
}

/** Cancels an order that is still processing and unpaid, and puts its stock back. */
export async function cancelCustomerOrder(code: string, auth: OrderAuth) {
  const id = await sql.begin(async (tx) => {
    const row = await lockedOrder(tx, code, auth);
    if (row.status === 'cancelled') return row.id;
    if (row.status !== 'processing') throw new HttpError('Đơn đã được giao đi nên không hủy được. Nếu cần đổi/trả, hãy chat với trợ lý AI.', 409);
    if (row.payment_status === 'paid') throw new HttpError('Đơn đã thanh toán nên chưa thể tự hủy. Vui lòng liên hệ cửa hàng để được hoàn tiền.', 409);
    await restockOrder(tx, row.id);
    await tx`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = ${row.id}`;
    await tx`UPDATE payments SET status = 'failed', updated_at = now() WHERE order_id = ${row.id} AND status = 'pending'`;
    await recordOrderEvent(tx, row.id, { type: 'cancelled', actor: 'customer', from: 'processing', to: 'cancelled' });
    return row.id;
  });
  await audit('customer', 'order.cancel', 'order', id, {});
  await syncCatalog();
  return getCustomerOrder(id, auth);
}

/** Outcome of the simulated payment page. Idempotent: paying an already paid order changes nothing. */
export async function payCustomerOrder(code: string, auth: OrderAuth, outcome: 'success' | 'failure') {
  const id = await sql.begin(async (tx) => {
    const row = await lockedOrder(tx, code, auth);
    if (!isOnline(row.payment_method)) throw new HttpError('Đơn COD thanh toán khi nhận hàng.', 409);
    if (row.status !== 'processing') throw new HttpError('Đơn này không còn chờ thanh toán.', 409);
    if (row.payment_status === 'paid') return row.id;
    const [pending] = await tx<{ id: string }[]>`SELECT id FROM payments WHERE order_id = ${row.id} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`;
    const paymentId = pending?.id ?? randomUUID();
    if (!pending) await tx`INSERT INTO payments (id, order_id, method, status, amount_vnd, provider_ref) VALUES (${paymentId}, ${row.id}, ${row.payment_method}, 'pending', ${row.total_vnd}, ${`SIM-${randomUUID().slice(0, 8).toUpperCase()}`})`;
    await tx`UPDATE payments SET status = ${outcome === 'success' ? 'succeeded' : 'failed'}, updated_at = now() WHERE id = ${paymentId}`;
    await tx`UPDATE orders SET payment_status = ${outcome === 'success' ? 'paid' : 'failed'} WHERE id = ${row.id}`;
    await recordOrderEvent(tx, row.id, { type: outcome === 'success' ? 'payment_succeeded' : 'payment_failed', actor: 'customer' });
    return row.id;
  });
  await audit('customer', outcome === 'success' ? 'payment.succeeded' : 'payment.failed', 'order', id, {});
  return getCustomerOrder(id, auth);
}
