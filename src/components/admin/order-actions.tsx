'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import { availableActions, type OrderAction, type OrderStatus, type PaymentStatus } from '@/features/orders/order-flow';
import { callApi } from '@/lib/client-api';

const copy: Record<OrderAction, { label: string; title: string; message: string; done: string; danger?: boolean }> = {
  ship: { label: 'Bắt đầu giao hàng', title: 'Chuyển đơn sang “Đang giao”?', message: 'Khách sẽ thấy đơn đang được giao và không thể tự hủy nữa.', done: 'Đơn đã chuyển sang đang giao.' },
  deliver: { label: 'Xác nhận đã giao', title: 'Xác nhận đã giao hàng?', message: 'Mốc giao hàng được ghi nhận và bắt đầu tính hạn đổi/trả 7 ngày. Đơn COD sẽ được ghi nhận đã thu tiền.', done: 'Đã xác nhận giao hàng.' },
  cancel: { label: 'Hủy đơn', title: 'Hủy đơn hàng này?', message: 'Hàng được trả về kho. Đơn đã thanh toán sẽ được ghi nhận hoàn tiền (giả lập).', done: 'Đã hủy đơn hàng.', danger: true },
};

export function OrderAdminActions({ code, status, paymentMethod, paymentStatus }: { code: string; status: OrderStatus; paymentMethod: string; paymentStatus: PaymentStatus }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const actions = availableActions({ status, paymentMethod, paymentStatus });
  const final = status === 'delivered' || status === 'cancelled';

  async function run(action: OrderAction) {
    const { title, message, done, danger, label } = copy[action];
    if (!(await confirm({ title, message, confirmLabel: label, danger }))) return;
    setBusy(true);
    const result = await callApi(`/api/admin/orders/${code}/status`, { json: { action, note } });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', done);
    setNote('');
    router.refresh();
  }

  if (final) return <p className="text-sm text-gray-500 dark:text-gray-400">{status === 'delivered' ? 'Đơn đã giao. Đổi/trả được xử lý qua trợ lý AI và trang Phê duyệt.' : 'Đơn đã hủy.'}</p>;

  const blocked = actions.filter((item) => !item.check.ok && item.action !== 'cancel');
  return (
    <div className="space-y-3">
      <Input placeholder="Ghi chú nội bộ (tuỳ chọn)" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} className="max-w-md" aria-label="Ghi chú" />
      <div className="flex flex-wrap gap-2">
        {actions.map(({ action, check }) => (
          <Button key={action} variant={action === 'cancel' ? 'outline' : 'default'} className={action === 'cancel' ? 'border-red-300 text-red-500 hover:text-red-600' : undefined}
            disabled={busy || !check.ok} title={check.ok ? undefined : check.message} onClick={() => void run(action)}>{copy[action].label}</Button>
        ))}
      </div>
      {blocked.length > 0 && status === 'processing' && !blocked[0].check.ok && blocked[0].action === 'ship' && <p className="text-theme-sm text-orange-600 dark:text-orange-400">{blocked[0].check.message}</p>}
    </div>
  );
}
