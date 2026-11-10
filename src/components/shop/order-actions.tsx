'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCooldown } from '@/components/shop/use-cooldown';
import { buttonClass } from '@/components/ui/button';
import type { CustomerOrder } from '@/features/orders/customer-orders';
import { callJson } from '@/lib/shop-client';
import { formatVnd } from '@/lib/format';

/**
 * Pay (simulated gateway) and cancel. `phone` is only needed when the order was not placed from this
 * browser (lookup page); `onUpdate` lets that page show the new state without a reload.
 */
export function OrderActions({ order, phone, onUpdate }: { order: CustomerOrder; phone?: string; onUpdate?: (order: CustomerOrder) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [confirming, setConfirming] = useState(false);
  const cooldown = useCooldown();
  const blocked = busy || cooldown.active;

  async function run(path: string, body: unknown, success: string) {
    setBusy(true); setMessage(undefined);
    const result = await callJson<CustomerOrder>(`/api/orders/${order.code}/${path}`, body);
    setBusy(false); setConfirming(false);
    if (!result.ok) { setMessage({ ok: false, text: result.error }); cooldown.start(result.retryAfterSeconds); return; }
    setMessage({ ok: true, text: success });
    if (onUpdate) onUpdate(result.data); else router.refresh();
  }

  return (
    <div className="space-y-4">
      {order.canPay && (
        <section className="space-y-3 rounded-card border border-brand/30 bg-brand-soft/50 p-5" aria-labelledby="pay-title">
          <div>
            <h3 id="pay-title" className="font-display text-lg">Cổng thanh toán (giả lập)</h3>
            <p className="text-sm text-ink-soft">Đây là môi trường thử nghiệm, không có tiền thật được chuyển. Chọn kết quả để mô phỏng thanh toán <strong>{formatVnd(order.totalVnd)}</strong>.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={blocked} onClick={() => void run('pay', { outcome: 'success', phone }, 'Thanh toán thành công. Cảm ơn bạn!')} className={buttonClass({ variant: 'brand' })}>Thanh toán thành công</button>
            <button disabled={blocked} onClick={() => void run('pay', { outcome: 'failure', phone }, 'Đã mô phỏng thanh toán thất bại. Bạn có thể thử lại.')} className={buttonClass({ variant: 'outline' })}>Mô phỏng thất bại</button>
          </div>
          {order.paymentStatus === 'failed' && <p className="text-sm text-sale">Lần thanh toán trước không thành công. Bạn có thể thử lại hoặc hủy đơn.</p>}
        </section>
      )}
      {/* Placed online before online payment was switched off: nothing to pay here, but the customer can still cancel. */}
      {!order.canPay && order.status === 'processing' && order.paymentMethod !== 'COD' && order.paymentStatus !== 'paid' && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Thanh toán online đang tạm ngưng. Cửa hàng sẽ liên hệ với bạn, hoặc bạn có thể hủy đơn và đặt lại với hình thức COD.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {order.canCancel && (confirming ? (
          <>
            <span className="text-sm text-ink-soft">Hủy đơn {order.code}? Hàng sẽ được trả về kho.</span>
            <button disabled={blocked} onClick={() => void run('cancel', { phone }, 'Đã hủy đơn hàng.')} className={buttonClass({ variant: 'danger', size: 'sm' })}>Xác nhận hủy</button>
            <button onClick={() => setConfirming(false)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>Giữ đơn</button>
          </>
        ) : <button onClick={() => setConfirming(true)} className={buttonClass({ variant: 'outline', size: 'sm' })}>Hủy đơn</button>)}
        {order.status === 'delivered' && <Link href="/chat" className={buttonClass({ variant: 'outline', size: 'sm' })}>Đổi size / trả hàng qua chat</Link>}
        {order.status === 'shipping' && <p className="text-sm text-ink-soft">Đơn đang được giao nên không thể hủy.</p>}
        {order.paymentStatus === 'paid' && order.status === 'processing' && <p className="text-sm text-ink-soft">Đơn đã thanh toán; cần hủy hoặc hoàn tiền, vui lòng liên hệ cửa hàng.</p>}
      </div>
      {cooldown.active && <p className="text-xs text-ink-muted">Có thể thử lại sau {cooldown.remaining} giây.</p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-md px-3 py-2 text-sm ${message.ok ? 'bg-brand-soft text-brand' : 'bg-sale-soft text-sale'}`}>{message.text}</p>}
    </div>
  );
}
