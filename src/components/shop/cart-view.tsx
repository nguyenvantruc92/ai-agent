'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonClass } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import type { Cart } from '@/features/shop/cart';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/format';
import { callJson } from '@/lib/shop-client';

export function CartSummary({ cart }: { cart: Pick<Cart, 'subtotalVnd' | 'shippingFeeVnd' | 'totalVnd' | 'amountToFreeShippingVnd' | 'freeShippingFromVnd'> }) {
  const progress = Math.min(100, Math.round((cart.subtotalVnd / Math.max(1, cart.freeShippingFromVnd)) * 100));
  return (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-ink-soft">Tạm tính</dt><dd className="tabular-nums">{formatVnd(cart.subtotalVnd)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">Phí giao hàng</dt><dd className={cn('tabular-nums', cart.shippingFeeVnd === 0 && 'text-brand')}>{cart.shippingFeeVnd ? formatVnd(cart.shippingFeeVnd) : 'Miễn phí'}</dd></div>
        <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Tổng cộng</dt><dd className="tabular-nums">{formatVnd(cart.totalVnd)}</dd></div>
      </dl>
      {cart.shippingFeeVnd > 0 && (
        <div className="space-y-1.5 text-xs text-ink-soft">
          <p>Mua thêm <strong>{formatVnd(cart.amountToFreeShippingVnd)}</strong> để được miễn phí giao hàng.</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
    </div>
  );
}

export function CartView({ cart }: { cart: Cart }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');

  async function change(lineId: string, request: () => ReturnType<typeof callJson>) {
    setBusy(lineId); setError('');
    const result = await request();
    setBusy(undefined);
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  }

  if (cart.lines.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line px-4 py-20 text-center">
        <p className="font-display text-2xl">Giỏ hàng đang trống</p>
        <p className="mt-1 text-sm text-ink-soft">Chọn vài món bạn thích rồi quay lại đây nhé.</p>
        <Link href="/" className={`${buttonClass({ variant: 'primary', size: 'lg' })} mt-6`}>Tiếp tục mua sắm</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-sale-soft px-3 py-2 text-sm text-sale">{error}</p>}
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {cart.lines.map((line) => (
            <li key={line.id} className={cn('flex gap-4 p-4', busy === line.id && 'opacity-60')}>
              <Link href={`/p/${line.slug}`} className="size-24 shrink-0 overflow-hidden rounded-md bg-sand">
                {/* eslint-disable-next-line @next/next/no-img-element -- local product photos */}
                {line.imageUrl ? <img src={line.imageUrl} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-xs text-ink-muted">Chưa có ảnh</span>}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/p/${line.slug}`} className="block truncate text-sm font-medium hover:underline">{line.name}</Link>
                <p className="text-xs text-ink-muted">{line.color} · size {line.size}</p>
                <div className="mt-1"><Price value={line.unitPriceVnd} oldValue={line.compareAtPriceVnd} /></div>
                {line.issue && <p role="alert" className="mt-1 text-xs text-sale">{line.issue.message}</p>}
                <div className="mt-3 inline-flex h-9 items-center rounded-md border border-line" role="group" aria-label={`Số lượng ${line.name}`}>
                  <button aria-label="Giảm" disabled={Boolean(busy) || line.quantity <= 1} onClick={() => void change(line.id, () => callJson(`/api/cart/items/${line.id}`, { quantity: line.quantity - 1 }, 'PATCH'))} className="grid size-9 place-items-center text-ink-soft hover:text-ink disabled:opacity-40">−</button>
                  <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                  <button aria-label="Tăng" disabled={Boolean(busy) || line.quantity >= Math.min(10, line.stock)} onClick={() => void change(line.id, () => callJson(`/api/cart/items/${line.id}`, { quantity: line.quantity + 1 }, 'PATCH'))} className="grid size-9 place-items-center text-ink-soft hover:text-ink disabled:opacity-40">+</button>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between">
                <p className="text-sm font-semibold tabular-nums">{formatVnd(line.lineTotalVnd)}</p>
                <button aria-label={`Xóa ${line.name}`} disabled={Boolean(busy)} onClick={() => void change(line.id, () => callJson(`/api/cart/items/${line.id}`, undefined, 'DELETE'))} className="text-xs text-ink-muted underline-offset-4 hover:text-sale hover:underline">Xóa</button>
              </div>
            </li>
          ))}
        </ul>
        <Link href="/" className="inline-block text-sm text-ink-soft underline underline-offset-4 hover:text-ink">← Tiếp tục mua sắm</Link>
      </div>

      <aside className="h-fit space-y-4 rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="font-display text-lg">Tóm tắt đơn hàng</h2>
        <CartSummary cart={cart} />
        {cart.canCheckout
          ? <Link href="/checkout" className={`${buttonClass({ variant: 'brand', size: 'lg' })} w-full`}>Tiến hành đặt hàng</Link>
          : <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Một số sản phẩm không còn đủ hàng. Hãy điều chỉnh hoặc xóa chúng để tiếp tục.</p>}
        <p className="text-center text-xs text-ink-muted">Giá và tồn kho được kiểm tra lại khi đặt hàng.</p>
      </aside>
    </div>
  );
}
