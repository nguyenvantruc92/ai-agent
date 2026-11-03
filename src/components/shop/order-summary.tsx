import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { paymentLabels } from '@/features/orders/customer-schemas';
import type { CustomerOrder } from '@/features/orders/customer-orders';
import { formatVnd } from '@/lib/format';

const statusView = {
  processing: { text: 'Đang xử lý', tone: 'warn' },
  shipping: { text: 'Đang giao hàng', tone: 'brand' },
  delivered: { text: 'Đã giao', tone: 'brand' },
  cancelled: { text: 'Đã hủy', tone: 'neutral' },
} as const;

export function paymentText(order: Pick<CustomerOrder, 'paymentMethod' | 'paymentStatus' | 'status'>) {
  if (order.paymentStatus === 'refunded') return { text: 'Đã hoàn tiền', tone: 'neutral' as const };
  if (order.status === 'cancelled') return { text: 'Đã hủy', tone: 'neutral' as const };
  if (order.paymentStatus === 'paid') return { text: 'Đã thanh toán', tone: 'brand' as const };
  if (order.paymentMethod === 'COD') return { text: 'Thanh toán khi nhận hàng', tone: 'neutral' as const };
  if (order.paymentStatus === 'failed') return { text: 'Thanh toán thất bại', tone: 'sale' as const };
  return { text: 'Chờ thanh toán', tone: 'warn' as const };
}

/** Read-only view of an order for the customer (order page and lookup result). */
export function OrderSummary({ order }: { order: CustomerOrder }) {
  const status = statusView[order.status];
  const payment = paymentText(order);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl tracking-tight">Đơn {order.code}</h2>
        <Badge tone={status.tone}>{status.text}</Badge><Badge tone={payment.tone}>{payment.text}</Badge>
      </div>
      <p className="text-sm text-ink-muted">Đặt lúc {new Date(order.orderedAt).toLocaleString('vi-VN')}{order.deliveredAt && <> · giao lúc {new Date(order.deliveredAt).toLocaleString('vi-VN')}</>}</p>

      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {order.items.map((item) => (
          <li key={`${item.productCode}-${item.size}-${item.color}`} className="flex justify-between gap-4 p-4 text-sm">
            <div className="min-w-0">
              {item.slug ? <Link href={`/p/${item.slug}`} className="font-medium hover:underline">{item.name}</Link> : <p className="font-medium">{item.name}</p>}
              <p className="text-xs text-ink-muted">{item.productCode} · {item.color} · size {item.size} · SL {item.quantity}</p>
            </div>
            <p className="shrink-0 tabular-nums">{formatVnd(item.lineTotalVnd)}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="space-y-1.5 rounded-card border border-line bg-surface p-4 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Tạm tính</dt><dd className="tabular-nums">{formatVnd(order.subtotalVnd)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Phí giao hàng</dt><dd className="tabular-nums">{order.shippingFeeVnd ? formatVnd(order.shippingFeeVnd) : 'Miễn phí'}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Tổng cộng</dt><dd className="tabular-nums">{formatVnd(order.totalVnd)}</dd></div>
          <p className="pt-1 text-xs text-ink-muted">{paymentLabels[order.paymentMethod] ?? order.paymentMethod}</p>
        </dl>
        <div className="space-y-1 rounded-card border border-line bg-surface p-4 text-sm">
          <p className="font-medium">{order.customerName}</p>
          <p className="text-ink-soft">{order.phoneMasked}</p>
          <p className="text-ink-soft">{order.address}</p>
          {order.note && <p className="pt-1 text-xs text-ink-muted">Ghi chú: {order.note}</p>}
        </div>
      </div>
    </div>
  );
}
