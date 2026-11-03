import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { seedOrders } from '@/features/orders/seed-data';
import { demoPhone } from '@/features/orders/phone';
import { idempotencyKey } from '@/features/orders/policy';
import type { ExistingRequest, Order, RequestProposal } from '@/features/orders/types';

const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();

export async function findOrder(orderId: string): Promise<Order | null> {
  const [order] = await sql<{ id: string; status: Order['status']; ordered_at: Date; delivered_at: Date | null; payment_method: string; payment_status: string; total_vnd: number }[]>`
    SELECT id, status, ordered_at, delivered_at, payment_method, payment_status, total_vnd FROM orders WHERE id = ${orderId.trim().toUpperCase()}
  `;
  if (!order) return null;
  const [items, requests] = await Promise.all([
    sql<{ product_id: string; product_name: string; size: string; color: string; quantity: number; unit_price_vnd: number; discount_percent: number; is_opened: boolean }[]>`
      SELECT product_id, product_name, size, color, quantity, unit_price_vnd, discount_percent, is_opened FROM order_items WHERE order_id = ${order.id} ORDER BY product_id
    `,
    sql<{ id: string; type: ExistingRequest['type']; product_id: string; requested_size: string | null; reason: string | null; status: string; idempotency_key: string; created_at: Date; item_size: string | null; item_color: string | null }[]>`
      SELECT id, type, product_id, requested_size, reason, status, idempotency_key, created_at, item_size, item_color FROM exchange_return_requests WHERE order_id = ${order.id} ORDER BY created_at
    `,
  ]);
  return {
    id: order.id,
    status: order.status,
    orderedAt: iso(order.ordered_at)!,
    deliveredAt: iso(order.delivered_at),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    totalVnd: order.total_vnd,
    canCancel: order.status === 'processing' && order.payment_status !== 'paid',
    items: items.map((item) => ({ productId: item.product_id, productName: item.product_name, size: item.size, color: item.color, quantity: item.quantity, unitPriceVnd: item.unit_price_vnd, discountPercent: item.discount_percent, isOpened: item.is_opened })),
    requests: requests.map((request) => ({ id: request.id, type: request.type, productId: request.product_id, requestedSize: request.requested_size, reason: request.reason, status: request.status, idempotencyKey: request.idempotency_key, createdAt: iso(request.created_at)!, itemSize: request.item_size, itemColor: request.item_color })),
  };
}

export async function audit(actor: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  await sql`INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, details) VALUES (${randomUUID()}, ${actor}, ${action}, ${entityType}, ${entityId}, ${sql.json(details as never)})`;
}

/**
 * Write path behind the MCP write tools. It re-checks that the approval is
 * approved and matches the payload, and is idempotent on the request key.
 */
export async function createApprovedRequest(proposal: RequestProposal, approvalRequestId: string) {
  const key = idempotencyKey(proposal);
  const [approval] = await sql<{ status: string; idempotency_key: string; action: string }[]>`
    SELECT status, idempotency_key, action FROM approval_requests WHERE id = ${approvalRequestId}
  `;
  if (!approval) throw new Error('Không tìm thấy approval request.');
  if (approval.status !== 'approved') throw new Error(`Approval đang ở trạng thái ${approval.status}, chưa được phép ghi.`);
  if (approval.idempotency_key !== key || approval.action !== proposal.action) throw new Error('Payload không khớp với yêu cầu đã được duyệt.');

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO exchange_return_requests (id, approval_request_id, idempotency_key, type, order_id, product_id, requested_size, reason, item_size, item_color)
    VALUES (
      ${randomUUID()}, ${approvalRequestId}, ${key}, ${proposal.action}, ${proposal.orderId.toUpperCase()}, ${proposal.productId.toUpperCase()},
      ${proposal.action === 'exchange_size' ? proposal.requestedSize : null}, ${proposal.action === 'return' ? proposal.reason : null},
      ${proposal.itemSize ?? null}, ${proposal.itemColor ?? null}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;
  const [request] = await sql<{ id: string; status: string; created_at: Date }[]>`SELECT id, status, created_at FROM exchange_return_requests WHERE idempotency_key = ${key}`;
  if (inserted.length) await audit('mcp', 'request.created', 'exchange_return_request', request.id, { approvalRequestId, idempotencyKey: key });
  return { requestId: request.id, status: request.status, created: inserted.length > 0, createdAt: iso(request.created_at) };
}

export { demoPhone } from '@/features/orders/phone';

/** Resets the demo orders (dates relative to now) and their requests/approvals. */
export async function resetSeedOrders(now = new Date()) {
  const ids = seedOrders.map((order) => order.id);
  const day = 24 * 60 * 60 * 1_000;
  await sql.begin(async (tx) => {
    await tx`DELETE FROM exchange_return_requests WHERE order_id IN ${tx(ids)}`;
    await tx`DELETE FROM approval_requests WHERE payload->>'orderId' IN ${tx(ids)}`;
    await tx`DELETE FROM orders WHERE id IN ${tx(ids)}`;
    for (const [index, order] of seedOrders.entries()) {
      const subtotal = order.items.reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0);
      const paid = order.status !== 'cancelled' && (order.paymentMethod !== 'COD' || order.status === 'delivered');
      await tx`
        INSERT INTO orders (id, customer_ref, status, ordered_at, delivered_at, payment_method,
          customer_name, phone, address, subtotal_vnd, total_vnd, payment_status)
        VALUES (${order.id}, ${`demo-customer-${String(index + 1).padStart(2, '0')}`}, ${order.status},
          ${new Date(now.getTime() - order.orderedDaysAgo * day)},
          ${order.deliveredDaysAgo === null ? null : new Date(now.getTime() - order.deliveredDaysAgo * day)},
          ${order.paymentMethod}, 'Khách demo', ${demoPhone(order.id)}, '123 Đường Demo, Quận 1, TP. Hồ Chí Minh',
          ${subtotal}, ${subtotal}, ${paid ? 'paid' : 'unpaid'})
      `;
      for (const item of order.items) {
        await tx`
          INSERT INTO order_items (id, order_id, product_id, product_name, size, color, quantity, unit_price_vnd, discount_percent, is_opened)
          VALUES (${randomUUID()}, ${order.id}, ${item.productId}, ${item.productName}, ${item.size}, ${item.color}, ${item.quantity}, ${item.unitPriceVnd}, ${item.discountPercent ?? 0}, ${item.isOpened ?? false})
        `;
      }
      if (order.existingRequest) {
        const request = order.existingRequest;
        const proposal: RequestProposal = request.type === 'exchange_size'
          ? { action: 'exchange_size', orderId: order.id, productId: request.productId, requestedSize: request.requestedSize! }
          : { action: 'return', orderId: order.id, productId: request.productId, reason: request.reason! };
        await tx`
          INSERT INTO exchange_return_requests (id, idempotency_key, type, order_id, product_id, requested_size, reason, created_at)
          VALUES (${randomUUID()}, ${idempotencyKey(proposal)}, ${request.type}, ${order.id}, ${request.productId}, ${request.requestedSize ?? null}, ${request.reason ?? null}, ${new Date(now.getTime() - day)})
        `;
      }
    }
  });
  return ids.length;
}
