import { createHash } from 'node:crypto';
import { paymentLabels } from '@/features/orders/customer-schemas';
import type { Order } from '@/features/orders/types';
import { formatVnd } from '@/lib/format';

/**
 * Shapes the shopping tools exchange between the MCP server and the graph. This file is pure (no database), so the
 * graph and its unit tests can use it; the database side lives in shop-tools.ts.
 */

export type AgentCartLine = {
  product_code: string; name: string; size: string; color: string; quantity: number;
  unit_price_vnd: number; line_total_vnd: number; issue: string | null;
};
export type AgentCart = {
  source_id: 'cart:current';
  lines: AgentCartLine[]; item_count: number;
  subtotal_vnd: number; shipping_fee_vnd: number; total_vnd: number;
  free_shipping_from_vnd: number; can_checkout: boolean;
};

export type AgentProductHit = {
  source_id: string; product_id: string; name: string; category: string;
  price_vnd: number; compare_at_price_vnd: number | null; colors: string[]; sizes_in_stock: string[]; in_stock: boolean;
};

export type CheckoutPayload = { name: string; phone: string; address: string; note: string; paymentMethod: string };
export type CancelPayload = { orderCode: string; phone: string | null };

/** What the customer is shown before agreeing. The same text is stored, so the card and the audit trail match. */
export function checkoutDetails(cart: AgentCart, payload: CheckoutPayload): string[] {
  return [
    ...cart.lines.map((line) => `${line.name} (${line.size} / ${line.color}) × ${line.quantity} — ${formatVnd(line.line_total_vnd)}`),
    `Tạm tính: ${formatVnd(cart.subtotal_vnd)}`,
    `Phí giao hàng: ${cart.shipping_fee_vnd ? formatVnd(cart.shipping_fee_vnd) : 'Miễn phí'}`,
    `Tổng thanh toán: ${formatVnd(cart.total_vnd)}`,
    `Người nhận: ${payload.name} · ${payload.phone}`,
    `Địa chỉ: ${payload.address}`,
    ...(payload.note ? [`Ghi chú: ${payload.note}`] : []),
    `Thanh toán: ${paymentLabels[payload.paymentMethod] ?? payload.paymentMethod}`,
  ];
}

export function cancelDetails(order: Order): string[] {
  return [
    `Đơn ${order.id} · ${order.items.map((item) => `${item.productName} (${item.size} / ${item.color}) × ${item.quantity}`).join('; ')}`,
    ...(order.totalVnd ? [`Giá trị đơn: ${formatVnd(order.totalVnd)}`] : []),
    'Hàng sẽ được hoàn lại kho; thao tác này không hoàn tác được.',
  ];
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);

/** Changes whenever the cart contents, a price or the shipping fee changes. */
export const cartFingerprint = (cart: AgentCart) => hash([cart.lines.map((line) => [line.product_code, line.size, line.color, line.quantity, line.unit_price_vnd]), cart.shipping_fee_vnd]);

export const orderFingerprint = (order: { id: string; status: string; paymentStatus?: string }) => hash([order.id, order.status, order.paymentStatus ?? null]);
