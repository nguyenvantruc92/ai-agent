import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OpenChatButton } from '@/components/shop/chat-widget';
import { OrderActions } from '@/components/shop/order-actions';
import { OrderSummary } from '@/components/shop/order-summary';
import { visitorSession } from '@/features/chat/visitor';
import { getCustomerOrder } from '@/features/orders/customer-orders';
import { HttpError } from '@/lib/http';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ placed?: string }> };

export const metadata = { title: 'Đơn hàng', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: Props) {
  const { code } = await params;
  const session = await visitorSession();
  const order = await getCustomerOrder(code, { visitorId: session.isNew ? undefined : session.visitorId })
    .catch((error) => { if (error instanceof HttpError && error.status === 404) return null; throw error; });
  // Not this browser's order: ask for the phone number instead of revealing anything.
  if (!order) redirect(`/orders/lookup?code=${encodeURIComponent(code)}`);
  const placed = (await searchParams).placed === '1';

  return (
    <div className="mx-auto max-w-3xl py-10">
      {placed && (
        <div role="status" className="mb-8 rounded-card bg-brand px-6 py-6 text-white">
          <p className="font-display text-2xl">Đặt hàng thành công!</p>
          <p className="mt-1 text-sm text-white/85">Mã đơn của bạn là <strong>{order.code}</strong>. Hãy lưu lại mã và số điện thoại để tra cứu đơn sau này.</p>
        </div>
      )}
      <OrderSummary order={order} />
      <div className="mt-6"><OrderActions order={order} /></div>
      <p className="mt-10 text-sm text-ink-muted">Cần hỗ trợ? <OpenChatButton className="text-brand underline underline-offset-4">Chat với trợ lý AI</OpenChatButton> · <Link href="/orders/lookup" className="underline underline-offset-4">Tra cứu đơn khác</Link></p>
    </div>
  );
}
