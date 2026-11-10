'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/feedback';
import { FormField } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/admin-ui/button';
import { Input } from '@/components/admin-ui/input';
import type { ShopSettings } from '@/features/shop/settings';
import { callApi } from '@/lib/client-api';
import { formatVnd } from '@/lib/format';

export function SettingsForm({ initial }: { initial: ShopSettings & { updatedAt: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<ShopSettings>({ shippingFeeVnd: initial.shippingFeeVnd, freeShippingFromVnd: initial.freeShippingFromVnd, maxOrdersPerHour: initial.maxOrdersPerHour });
  const [busy, setBusy] = useState(false);
  const dirty = values.shippingFeeVnd !== initial.shippingFeeVnd || values.freeShippingFromVnd !== initial.freeShippingFromVnd || values.maxOrdersPerHour !== initial.maxOrdersPerHour;
  const set = (key: keyof ShopSettings) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: Number(event.target.value) });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await callApi('/api/admin/settings', { method: 'PUT', json: values });
    setBusy(false);
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', 'Đã lưu cài đặt. Chatbot sẽ cập nhật chính sách giao hàng sau vài giây.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cài đặt cửa hàng" description="Các con số này được dùng ngay cho giỏ hàng, thanh toán và câu trả lời của chatbot." />
      <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
        <FormField label="Phí giao hàng tiêu chuẩn (VNĐ)" note={formatVnd(values.shippingFeeVnd)}><Input type="number" min={0} step={1000} required value={values.shippingFeeVnd} onChange={set('shippingFeeVnd')} /></FormField>
        <FormField label="Miễn phí giao hàng từ (VNĐ)" hint="Đơn đạt ngưỡng này trở lên không tính phí giao hàng." note={formatVnd(values.freeShippingFromVnd)}><Input type="number" min={0} step={1000} required value={values.freeShippingFromVnd} onChange={set('freeShippingFromVnd')} /></FormField>
        <FormField label="Số đơn tối đa mỗi khách trong một giờ" hint="Giúp chặn đặt đơn hàng loạt."><Input type="number" min={1} max={100} required value={values.maxOrdersPerHour} onChange={set('maxOrdersPerHour')} /></FormField>
        <p className="rounded-xl bg-orange-50 px-4 py-3 text-theme-sm text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
          File PDF chính sách (FAQ) là văn bản cố định. Nếu bạn đổi phí giao hàng hoặc ngưỡng miễn phí, hãy cập nhật cả PDF ở trang Knowledge để chatbot không đưa ra hai con số khác nhau.
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">{initial.updatedAt ? `Cập nhật lần cuối: ${new Date(initial.updatedAt).toLocaleString('vi-VN')}` : 'Đang dùng giá trị mặc định.'}</p>
          <Button type="submit" disabled={busy || !dirty}>{busy ? 'Đang lưu…' : 'Lưu cài đặt'}</Button>
        </div>
      </form>
    </div>
  );
}
