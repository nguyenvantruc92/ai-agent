import { isOnline } from '@/features/orders/customer-schemas';

export type OrderStatus = 'processing' | 'shipping' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';
export type OrderAction = 'ship' | 'deliver' | 'cancel';

type Flow = { status: OrderStatus; paymentMethod: string; paymentStatus: PaymentStatus };
export type Check = { ok: true } | { ok: false; message: string };

/**
 * The order state machine staff operate:
 *   processing --ship--> shipping --deliver--> delivered      (cancel is allowed until it ships out of reach)
 * Online orders must be paid before they ship; a delivered order can no longer be cancelled
 * (returns go through the exchange/return flow, which is bound to `delivered_at`).
 */
export function checkTransition(order: Flow, action: OrderAction): Check {
  if (order.status === 'cancelled') return { ok: false, message: 'Đơn đã hủy, không thể thao tác thêm.' };
  if (order.status === 'delivered') return { ok: false, message: 'Đơn đã giao. Đổi/trả được xử lý qua luồng đổi/trả của trợ lý AI.' };
  if (action === 'cancel') return { ok: true };
  if (action === 'ship') {
    if (order.status !== 'processing') return { ok: false, message: 'Đơn này đã chuyển sang giao hàng.' };
    if (isOnline(order.paymentMethod) && order.paymentStatus !== 'paid') return { ok: false, message: 'Đơn thanh toán online chưa được thanh toán nên chưa thể giao hàng.' };
    return { ok: true };
  }
  if (order.status !== 'shipping') return { ok: false, message: 'Cần chuyển đơn sang “Đang giao” trước khi xác nhận đã giao.' };
  return { ok: true };
}

/** Which buttons staff should see, each with the reason when it is unavailable. */
export function availableActions(order: Flow) {
  return (['ship', 'deliver', 'cancel'] as const).map((action) => ({ action, check: checkTransition(order, action) }));
}

export const statusLabels: Record<OrderStatus, string> = { processing: 'Đang xử lý', shipping: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
export const paymentStatusLabels: Record<PaymentStatus, string> = { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', failed: 'Thanh toán thất bại', refunded: 'Đã hoàn tiền' };
