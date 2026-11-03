import { Badge } from '@/components/admin-ui/badge';
import { paymentStatusLabels, statusLabels, type OrderStatus, type PaymentStatus } from '@/features/orders/order-flow';

const statusColor = { processing: 'warning', shipping: 'info', delivered: 'success', cancelled: 'gray' } as const;
const paymentColor = { unpaid: 'gray', paid: 'success', failed: 'error', refunded: 'warning' } as const;

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge color={statusColor[status]} size="sm">{statusLabels[status]}</Badge>;
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge color={paymentColor[status]} size="sm">{paymentStatusLabels[status]}</Badge>;

export const methodLabels: Record<string, string> = { COD: 'COD', bank_transfer: 'Chuyển khoản', card: 'Thẻ' };

export const eventLabels: Record<string, string> = {
  placed: 'Khách đặt hàng', payment_succeeded: 'Thanh toán thành công', payment_failed: 'Thanh toán thất bại', shipped: 'Bắt đầu giao hàng',
  delivered: 'Đã giao hàng', cod_collected: 'Đã thu tiền COD', cancelled: 'Đơn bị hủy', refunded: 'Hoàn tiền (giả lập)',
};

export const paymentRowLabels: Record<string, string> = { pending: 'Đang chờ', succeeded: 'Thành công', failed: 'Thất bại', refunded: 'Đã hoàn tiền' };
