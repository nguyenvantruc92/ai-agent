import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import type { OrderStatus } from '@/features/orders/order-flow';

export type OrderEvent = { type: string; actor: string; from?: OrderStatus | null; to?: OrderStatus | null; note?: string };

/** One line of the order timeline shown to staff. clock_timestamp() (not now()) keeps events of one transaction in order. */
export async function recordOrderEvent(tx: TransactionSql, orderId: string, event: OrderEvent) {
  await tx`
    INSERT INTO order_events (id, order_id, type, actor, from_status, to_status, note, created_at)
    VALUES (${randomUUID()}, ${orderId}, ${event.type}, ${event.actor}, ${event.from ?? null}, ${event.to ?? null}, ${event.note ?? ''}, clock_timestamp())
  `;
}

/** Puts every line's quantity back on its variant (lines of seeded demo orders have no variant and are skipped). */
export async function restockOrder(tx: TransactionSql, orderId: string) {
  const items = await tx<{ variant_id: string; quantity: number }[]>`SELECT variant_id, quantity FROM order_items WHERE order_id = ${orderId} AND variant_id IS NOT NULL ORDER BY variant_id`;
  for (const item of items) await tx`UPDATE product_variants SET stock = stock + ${item.quantity}, updated_at = now() WHERE id = ${item.variant_id}`;
  return items.length;
}
