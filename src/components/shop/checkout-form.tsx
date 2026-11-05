'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CartSummary } from '@/components/shop/cart-view';
import { useCooldown } from '@/components/shop/use-cooldown';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { paymentLabels, type PaymentMethod } from '@/features/orders/customer-schemas';
import type { Cart } from '@/features/shop/cart';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/format';
import { callJson, newKey } from '@/lib/shop-client';

const hints: Record<PaymentMethod, string> = {
  COD: 'Kiểm tra hàng rồi mới thanh toán khi nhận.',
  bank_transfer: 'Thanh toán online (giả lập) ngay sau khi đặt hàng.',
  card: 'Thanh toán online (giả lập) ngay sau khi đặt hàng.',
};

/** `paymentMethods` comes from the server (online payment can be switched off); checkout enforces it again. */
export function CheckoutForm({ cart, paymentMethods }: { cart: Cart; paymentMethods: PaymentMethod[] }) {
  const router = useRouter();
  // One key per page visit: pressing the button twice, or retrying after a network error, can never create two orders.
  const [idempotencyKey] = useState(newKey);
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '' });
  const [method, setMethod] = useState<PaymentMethod>('COD');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const result = await callJson<{ code: string }>('/api/checkout', { ...form, paymentMethod: method, idempotencyKey });
    if (!result.ok) { setError(result.error); setBusy(false); cooldown.start(result.retryAfterSeconds); return; }
    router.push(`/orders/${result.data.code}?placed=1`);
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-card border border-line bg-surface p-5">
          <h2 className="font-display text-lg">Thông tin nhận hàng</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Họ và tên"><Input required autoComplete="name" value={form.name} onChange={set('name')} maxLength={80} placeholder="Nguyễn Văn A" /></Field>
            <Field label="Số điện thoại" hint="Dùng để tra cứu đơn hàng"><Input required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="09xx xxx xxx" /></Field>
          </div>
          <Field label="Địa chỉ"><Input required autoComplete="street-address" value={form.address} onChange={set('address')} maxLength={250} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Field>
          <Field label="Ghi chú (tuỳ chọn)"><Textarea rows={2} value={form.note} onChange={set('note')} maxLength={300} /></Field>
        </section>

        <fieldset className="space-y-2 rounded-card border border-line bg-surface p-5">
          <legend className="px-1 font-display text-lg">Phương thức thanh toán</legend>
          {paymentMethods.map((value) => (
            <label key={value} className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm', method === value ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-ink/30')}>
              <input type="radio" name="payment" value={value} checked={method === value} onChange={() => setMethod(value)} className="mt-0.5 accent-[var(--color-brand)]" />
              <span><span className="block font-medium">{paymentLabels[value]}</span><span className="text-xs text-ink-muted">{hints[value]}</span></span>
            </label>
          ))}
        </fieldset>
      </div>

      <aside className="h-fit space-y-4 rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="font-display text-lg">Đơn hàng của bạn</h2>
        <ul className="space-y-2 text-sm">
          {cart.lines.map((line) => <li key={line.id} className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-soft">{line.quantity} × {line.name} <span className="text-ink-muted">({line.size})</span></span><span className="shrink-0 tabular-nums">{formatVnd(line.lineTotalVnd)}</span></li>)}
        </ul>
        <div className="border-t border-line pt-3"><CartSummary cart={cart} /></div>
        {error && <p role="alert" className="rounded-md bg-sale-soft px-3 py-2 text-sm text-sale">{error} {error.includes('hết hàng') || error.includes('chỉ còn') || error.includes('không còn') ? <Link href="/cart" className="underline">Về giỏ hàng</Link> : null}</p>}
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy || cooldown.active}>{busy ? 'Đang đặt hàng…' : cooldown.active ? `Thử lại sau ${cooldown.remaining}s` : `Đặt hàng · ${formatVnd(cart.totalVnd)}`}</Button>
        <p className="text-center text-xs text-ink-muted">Bằng việc đặt hàng, bạn đồng ý với chính sách đổi trả của cửa hàng.</p>
      </aside>
    </form>
  );
}
