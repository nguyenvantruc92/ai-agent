import Link from 'next/link';
import { NativeSelect } from '@/components/admin/form';
import { OrderStatusBadge, PaymentStatusBadge, methodLabels } from '@/components/admin/order-badges';
import { EmptyState, PageHeader, td, th, thEnd } from '@/components/admin/page-header';
import { Button, } from '@/components/admin-ui/button';
import { buttonVariants } from '@/components/admin-ui/button-variants';
import { CartIcon, SearchIcon } from '@/components/admin-ui/icons';
import { adminOrderCounts, listAdminOrders } from '@/features/orders/admin-orders';
import { orderListQuery } from '@/features/orders/admin-schemas';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Đơn hàng · Admin' };

const input = 'h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-hidden focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  // Blank form fields arrive as "", which must mean "no filter" rather than a validation error.
  const parsed = orderListQuery.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value)));
  const query = parsed.success ? parsed.data : orderListQuery.parse({});
  const [result, counts] = await Promise.all([listAdminOrders(query), adminOrderCounts()]);

  const link = (page: number, status = query.status) => {
    const params = new URLSearchParams(Object.entries({ status, q: query.q, payment: query.payment, from: query.from, to: query.to, page: page > 1 ? String(page) : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/admin/orders${params.size ? `?${params}` : ''}`;
  };
  const tabs = [
    { label: 'Tất cả', status: undefined, count: counts.all },
    { label: 'Đang xử lý', status: 'processing' as const, count: counts.processing },
    { label: 'Đang giao', status: 'shipping' as const, count: counts.shipping },
    { label: 'Đã giao', status: 'delivered' as const, count: counts.delivered },
    { label: 'Đã hủy', status: 'cancelled' as const, count: counts.cancelled },
  ];
  const filtered = Boolean(query.q || query.payment || query.from || query.to);

  return (
    <div className="space-y-5">
      <PageHeader title="Đơn hàng" description="Theo dõi, xử lý và giao đơn của khách." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Lọc theo trạng thái" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
          {tabs.map((tab) => {
            const active = tab.status === query.status;
            return (
              <Link key={tab.label} href={link(1, tab.status)} aria-current={active ? 'page' : undefined}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors', active ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white')}>
                {tab.label}<span className={cn('rounded-full px-1.5 py-0.5 text-xs tabular-nums', active ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400' : 'bg-gray-200/60 text-gray-500 dark:bg-white/5 dark:text-gray-400')}>{tab.count}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap items-end gap-2">
          {query.status && <input type="hidden" name="status" value={query.status} />}
          <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={query.q} placeholder="Mã đơn, tên, SĐT…" className={cn(input, 'w-56 pl-11 placeholder:text-gray-400')} /></div>
          <NativeSelect name="payment" defaultValue={query.payment ?? ''} className="w-44" aria-label="Thanh toán">
            <option value="">Mọi thanh toán</option><option value="unpaid">Chưa thanh toán</option><option value="paid">Đã thanh toán</option><option value="failed">Thất bại</option><option value="refunded">Đã hoàn tiền</option>
          </NativeSelect>
          <input type="date" name="from" defaultValue={query.from} aria-label="Từ ngày" className={input} />
          <input type="date" name="to" defaultValue={query.to} aria-label="Đến ngày" className={input} />
          <Button size="sm" type="submit" variant="outline">Lọc</Button>
          {filtered && <Link href={query.status ? `/admin/orders?status=${query.status}` : '/admin/orders'} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Xóa lọc</Link>}
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr><th className={th}>Mã đơn</th><th className={th}>Khách hàng</th><th className={thEnd}>SP</th><th className={thEnd}>Tổng tiền</th><th className={th}>Thanh toán</th><th className={th}>Trạng thái</th><th className={th}>Ngày đặt</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {result.items.length === 0 && <tr><td colSpan={7}><EmptyState icon={<CartIcon />} title="Không có đơn hàng phù hợp" hint={filtered || query.status ? 'Thử đổi hoặc xóa bộ lọc.' : 'Đơn đầu tiên sẽ xuất hiện ở đây.'} /></td></tr>}
              {result.items.map((order) => (
                <tr key={order.code} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}><Link href={`/admin/orders/${order.code}`} className="font-medium text-brand-500 hover:underline dark:text-brand-400">{order.code}</Link></td>
                  <td className={td}><p className="text-gray-800 dark:text-white/90">{order.customerName || '—'}</p><p className="text-theme-xs text-gray-500 dark:text-gray-400">{order.phone}</p></td>
                  <td className={`${td} text-end tabular-nums`}>{order.itemCount}</td>
                  <td className={`${td} text-end font-medium tabular-nums`}>{formatVnd(order.totalVnd)}</td>
                  <td className={td}><div className="flex flex-wrap items-center gap-1.5"><span className="text-theme-xs text-gray-500">{methodLabels[order.paymentMethod] ?? order.paymentMethod}</span><PaymentStatusBadge status={order.paymentStatus} /></div></td>
                  <td className={td}><OrderStatusBadge status={order.status} /></td>
                  <td className={`${td} whitespace-nowrap text-gray-500`}>{new Date(order.orderedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.pageCount > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>Trang {result.page}/{result.pageCount} · {result.total} đơn</span>
          <div className="flex gap-2">
            {result.page > 1 && <Link href={link(result.page - 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>← Trước</Link>}
            {result.page < result.pageCount && <Link href={link(result.page + 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Sau →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
