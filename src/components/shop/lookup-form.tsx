'use client';

import { FormEvent, useState } from 'react';
import { OrderActions } from '@/components/shop/order-actions';
import { OrderSummary } from '@/components/shop/order-summary';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { CustomerOrder } from '@/features/orders/customer-orders';
import { callJson } from '@/lib/shop-client';

export function LookupForm({ defaultCode }: { defaultCode: string }) {
  const [code, setCode] = useState(defaultCode);
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<CustomerOrder>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setOrder(undefined);
    const result = await callJson<CustomerOrder>('/api/orders/lookup', { code, phone });
    setBusy(false);
    if (result.ok) setOrder(result.data); else setError(result.error);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Mã đơn hàng"><Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FT-2026-2001" /></Field>
        <Field label="Số điện thoại đặt hàng"><Input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" /></Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang tìm…' : 'Tra cứu'}</Button>
      </form>
      {error && <p role="alert" className="rounded-md bg-sale-soft px-3 py-2 text-sm text-sale">{error}</p>}
      {order && <><OrderSummary order={order} /><OrderActions order={order} phone={phone} onUpdate={setOrder} /></>}
    </div>
  );
}
