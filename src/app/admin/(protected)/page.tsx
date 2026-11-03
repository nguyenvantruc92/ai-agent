import Link from 'next/link';
import { CategoryBars, RevenueChart, StockDonut } from '@/components/admin/charts';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/admin/order-badges';
import { EmptyState, MetricCard, PageHeader, Panel, td, th, thEnd } from '@/components/admin/page-header';
import { SyncPill } from '@/components/admin/sync-pill';
import { Badge } from '@/components/admin-ui/badge';
import { buttonVariants } from '@/components/admin-ui/button-variants';
import { AlertIcon, CartIcon, CheckCircleIcon, ClockIcon, DollarIcon, PlusIcon, TaskIcon } from '@/components/admin-ui/icons';
import { getDashboard } from '@/features/catalog/dashboard';
import { getOrderStats } from '@/features/orders/admin-orders';
import { formatVnd } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · Admin' };

const actions: Record<string, string> = {
  'product.create': 'tạo sản phẩm', 'product.update': 'cập nhật sản phẩm', 'product.delete': 'xóa sản phẩm',
  'product.image_add': 'thêm ảnh cho sản phẩm', 'product.image_delete': 'xóa ảnh của sản phẩm',
  'category.create': 'tạo danh mục', 'category.update': 'cập nhật danh mục', 'category.delete': 'xóa danh mục',
};

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ trước`;
  return `${Math.round(minutes / 1440)} ngày trước`;
}

export default async function AdminDashboard() {
  const [data, orders] = await Promise.all([getDashboard(), getOrderStats()]);
  const needAttention = data.outOfStock + data.lowStock;
  const inStock = Math.max(0, data.products.active - needAttention);

  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan" description="Tình hình cửa hàng và trợ lý AI trong một màn hình."
        actions={<Link href="/admin/products/new" className={buttonVariants({  })}><PlusIcon />Thêm sản phẩm</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <MetricCard label="Đơn chờ xử lý" value={orders.processing} icon={<CartIcon />} tone={orders.processing ? 'warn' : 'success'} href="/admin/orders?status=processing"
          hint={`${orders.today} đơn mới hôm nay`} />
        <MetricCard label="Doanh thu 30 ngày" value={formatVnd(orders.revenue30)} icon={<DollarIcon />} tone="brand" href="/admin/orders?payment=paid"
          hint={`${orders.orders30} đơn · chỉ tính đơn đã thanh toán`} />
        <MetricCard label="Chờ duyệt đổi/trả" value={data.pendingApprovals} icon={<TaskIcon />} tone={data.pendingApprovals ? 'danger' : 'neutral'} href="/admin/approvals"
          hint={data.pendingApprovals ? 'Khách đang chờ nhân viên xử lý' : 'Không có yêu cầu nào đang chờ'} />
        <MetricCard label="Cần nhập hàng" value={needAttention} icon={<AlertIcon />} tone={needAttention ? 'warn' : 'success'} href="/admin/products?status=active"
          hint={`${data.outOfStock} hết hàng · ${data.lowStock} sắp hết · ${data.products.active} sản phẩm đang bán`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Panel title="Doanh thu 14 ngày gần nhất" className="xl:col-span-7"><div className="px-3 pb-4 sm:px-5"><RevenueChart data={orders.byDay} /></div></Panel>
        <Panel title="Đơn gần đây" className="xl:col-span-5" action={<Link href="/admin/orders" className="text-sm text-brand-500 hover:underline dark:text-brand-400">Tất cả đơn →</Link>}>
          {orders.recent.length === 0 ? <EmptyState icon={<CartIcon />} title="Chưa có đơn hàng" hint="Đơn đầu tiên sẽ xuất hiện ở đây." /> : (
            <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-white/5 dark:border-white/5">
              {orders.recent.map((order) => (
                <li key={order.code}>
                  <Link href={`/admin/orders/${order.code}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 sm:px-6 dark:hover:bg-white/2">
                    <div className="min-w-0 flex-1"><p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{order.code} · {order.customerName || '—'}</p><p className="text-theme-xs text-gray-500">{ago(order.orderedAt)} · {formatVnd(order.totalVnd)}</p></div>
                    <div className="flex flex-col items-end gap-1"><OrderStatusBadge status={order.status} /><PaymentStatusBadge status={order.paymentStatus} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Panel title="Sản phẩm theo danh mục" className="xl:col-span-7"><div className="px-3 pb-4 sm:px-5"><CategoryBars data={data.byCategory} /></div></Panel>
        <Panel title="Tình trạng tồn kho" className="xl:col-span-5"><div className="px-3 pb-4 sm:px-5"><StockDonut ok={inStock} low={data.lowStock} out={data.outOfStock} /></div></Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Panel title="Sản phẩm cần nhập hàng" className="xl:col-span-7" action={<Link href="/admin/products" className="text-sm text-brand-500 hover:underline dark:text-brand-400">Tất cả sản phẩm →</Link>}>
          {data.attention.length === 0 ? (
            <EmptyState icon={<CheckCircleIcon />} title="Tồn kho ổn" hint="Chưa có sản phẩm nào sắp hết." />
          ) : (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-white/5">
              <table className="w-full min-w-[460px]">
                <thead className="border-b border-gray-100 dark:border-white/5"><tr><th className={th}>Sản phẩm</th><th className={`${thEnd}`}>Tồn kho</th><th className={th}>Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {data.attention.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                      <td className={td}><Link href={`/admin/products/${product.id}`} className="font-medium text-gray-800 hover:underline dark:text-white/90">{product.name}</Link><p className="text-theme-xs text-gray-500 dark:text-gray-400">{product.code} · {product.category}</p></td>
                      <td className={`${td} text-end tabular-nums`}>{product.stock}<span className="block text-theme-xs text-gray-500">{product.variants} biến thể</span></td>
                      <td className={td}><Badge color={product.level === 'out' ? 'error' : 'warning'} size="sm">{product.level === 'out' ? 'Hết hàng' : 'Sắp hết'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-6 xl:col-span-5">
          <Panel title="Trợ lý AI">
            <div className="space-y-3 px-5 pb-5 text-sm sm:px-6">
              <div className="flex items-center justify-between gap-2"><span className="text-gray-500 dark:text-gray-400">Dữ liệu sản phẩm</span><SyncPill sync={data.sync} /></div>
              {data.sync.state === 'failed' && <p className="rounded-lg bg-red-50 px-3 py-2 text-theme-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">{data.sync.error}</p>}
              <div className="flex gap-2 pt-1"><Link href="/admin/knowledge" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Knowledge</Link><Link href="/chat" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Thử chat</Link></div>
            </div>
          </Panel>
          <Panel title="Hoạt động gần đây">
            {data.activity.length === 0 ? <EmptyState icon={<ClockIcon />} title="Chưa có hoạt động nào" /> : (
              <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-white/5 dark:border-white/5">
                {data.activity.map((item) => {
                  const label = String(item.details.code ?? item.details.name ?? item.details.productCode ?? '');
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-5 py-3 text-theme-sm sm:px-6">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"><ClockIcon className="size-4" /></span>
                      <p className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300"><span className="text-gray-500">{item.actor} </span>{actions[item.action] ?? item.action}{label && <span className="font-medium text-gray-800 dark:text-white/90"> {label}</span>}</p>
                      <time dateTime={item.createdAt} className="shrink-0 text-theme-xs text-gray-500">{ago(item.createdAt)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
