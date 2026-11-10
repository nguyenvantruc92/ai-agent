import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderAdminActions } from '@/components/admin/order-actions';
import { OrderStatusBadge, PaymentStatusBadge, eventLabels, methodLabels, paymentRowLabels } from '@/components/admin/order-badges';
import { td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { getAdminOrder } from '@/features/orders/admin-orders';
import { REQUEST_WINDOW_DAYS } from '@/features/orders/policy';
import { HttpError } from '@/lib/http';
import { formatVnd } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Chi tiết đơn · Admin' };

const card = 'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3';
const cardTitle = 'border-b border-gray-100 px-5 py-4 text-lg font-semibold text-gray-800 sm:px-6 dark:border-white/5 dark:text-white/90';
const isPast = (date: Date) => date.getTime() < Date.now();
const time = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export default async function OrderDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const order = await getAdminOrder((await params).code).catch((error) => { if (error instanceof HttpError && error.status === 404) return null; throw error; });
  if (!order) notFound();
  const returnUntil = order.deliveredAt ? new Date(new Date(order.deliveredAt).getTime() + REQUEST_WINDOW_DAYS * 86_400_000) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">← Đơn hàng</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-title-sm font-semibold text-gray-800 sm:text-title-lg dark:text-white/90">Đơn {order.code}</h1>
          <OrderStatusBadge status={order.status} /><PaymentStatusBadge status={order.paymentStatus} />
        </div>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">Đặt lúc {time(order.orderedAt)} · {methodLabels[order.paymentMethod] ?? order.paymentMethod}{order.deliveredAt && <> · giao lúc {time(order.deliveredAt)}</>}</p>
      </div>

      <section className={`${card} p-5 sm:p-6`}><h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">Xử lý đơn</h2><OrderAdminActions code={order.code} status={order.status} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} /></section>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className={`${card} overflow-hidden`}>
            <h2 className={cardTitle}>Sản phẩm</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-gray-100 dark:border-white/5"><tr><th className={th}>Sản phẩm</th><th className={th}>Phân loại</th><th className={thEnd}>Đơn giá</th><th className={thEnd}>SL</th><th className={thEnd}>Thành tiền</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {order.items.map((item) => (
                    <tr key={`${item.productCode}-${item.size}-${item.color}`}>
                      <td className={td}>{item.slug ? <Link href={`/admin/products?q=${item.productCode}`} className="font-medium text-gray-800 hover:underline dark:text-white/90">{item.name}</Link> : <span className="font-medium text-gray-800 dark:text-white/90">{item.name}</span>}<p className="text-theme-xs text-gray-500">{item.productCode}</p></td>
                      <td className={td}>{item.color} · {item.size}{item.discountPercent > 0 && <> <Badge color="error" size="sm">-{item.discountPercent}%</Badge></>}</td>
                      <td className={`${td} text-end tabular-nums`}>{formatVnd(item.unitPriceVnd)}</td>
                      <td className={`${td} text-end tabular-nums`}>{item.quantity}</td>
                      <td className={`${td} text-end font-medium tabular-nums`}>{formatVnd(item.unitPriceVnd * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto max-w-xs space-y-1.5 border-t border-gray-100 px-5 py-4 text-theme-sm sm:px-6 dark:border-white/5">
              <div className="flex justify-between"><dt className="text-gray-500">Tạm tính</dt><dd className="tabular-nums">{formatVnd(order.subtotalVnd)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Phí giao hàng</dt><dd className="tabular-nums">{order.shippingFeeVnd ? formatVnd(order.shippingFeeVnd) : 'Miễn phí'}</dd></div>
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold text-gray-800 dark:border-white/5 dark:text-white/90"><dt>Tổng cộng</dt><dd className="tabular-nums">{formatVnd(order.totalVnd)}</dd></div>
            </dl>
          </section>

          <section className={card}>
            <h2 className={cardTitle}>Dòng thời gian</h2>
            {order.events.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500 sm:px-6">Đơn này được tạo trước khi hệ thống ghi dòng thời gian. Đặt lúc {time(order.orderedAt)}.</p> : (
              <ol className="space-y-5 px-5 py-5 sm:px-6">
                {order.events.map((event) => (
                  <li key={event.id} className="relative flex gap-3">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    <div><p className="text-sm font-medium text-gray-800 dark:text-white/90">{eventLabels[event.type] ?? event.type}</p>
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{time(event.createdAt)} · {event.actor === 'admin' ? 'Nhân viên' : event.actor === 'customer' ? 'Khách hàng' : event.actor}</p>
                      {event.note && <p className="mt-0.5 text-theme-sm text-gray-600 dark:text-gray-300">{event.type === 'placed' ? `Thanh toán: ${methodLabels[event.note] ?? event.note}` : event.note}</p>}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className={`${card} space-y-1 p-5 sm:p-6`}>
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">Khách hàng</h2>
            <p className="font-medium text-gray-800 dark:text-white/90">{order.customerName || '—'}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{order.phone || '—'}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{order.address || '—'}</p>
            {order.note && <p className="pt-2 text-theme-sm text-gray-500 dark:text-gray-400">Ghi chú của khách: {order.note}</p>}
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">Thanh toán</h2>
            {order.payments.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{order.paymentMethod === 'COD' ? 'Thanh toán khi nhận hàng; sẽ được ghi nhận khi xác nhận đã giao.' : 'Chưa có giao dịch.'}</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-theme-sm">
                    <div><p className="tabular-nums text-gray-800 dark:text-white/90">{formatVnd(payment.amountVnd)}</p><p className="text-theme-xs text-gray-500">{payment.providerRef ?? '—'} · {time(payment.createdAt)}</p></div>
                    <Badge color={payment.status === 'succeeded' ? 'success' : payment.status === 'failed' ? 'error' : payment.status === 'refunded' ? 'warning' : 'gray'} size="sm">{paymentRowLabels[payment.status] ?? payment.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">Đổi / trả</h2>
            {returnUntil && <p className="mb-3 text-theme-sm text-gray-600 dark:text-gray-300">Hạn đổi/trả đến <strong>{time(returnUntil.toISOString())}</strong>{isPast(returnUntil) && <span className="text-red-500"> (đã hết hạn)</span>}.</p>}
            {order.pendingApprovals > 0 && <p className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-theme-sm text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">Có {order.pendingApprovals} yêu cầu đang chờ duyệt. <Link href="/admin/approvals" className="underline">Mở trang duyệt</Link></p>}
            {order.requests.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có yêu cầu đổi/trả.</p> : (
              <ul className="space-y-2 text-theme-sm">
                {order.requests.map((request) => <li key={request.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/3"><span className="font-medium">{request.type === 'return' ? 'Trả hàng' : `Đổi sang size ${request.requestedSize}`}</span> · {request.productCode}<br /><span className="text-theme-xs text-gray-500">{time(request.createdAt)}{request.reason && ` · ${request.reason}`}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
