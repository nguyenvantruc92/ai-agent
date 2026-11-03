'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonClass } from '@/components/ui/button';
import type { StoreVariant } from '@/features/catalog/queries';
import { cn } from '@/lib/cn';
import { colorDot } from '@/lib/colors';
import { callJson } from '@/lib/shop-client';

const MAX_PER_ORDER = 10;
const LOW = 5;

/** Colour then size selection with per-variant stock, and the add-to-cart button. */
export function VariantPicker({ variants, sizes, colors, productName }: { variants: StoreVariant[]; sizes: string[]; colors: string[]; productName: string }) {
  const stock = useMemo(() => new Map(variants.map((variant) => [`${variant.color}\u0000${variant.size}`, variant.stock])), [variants]);
  const available = (color: string, size: string) => stock.get(`${color}\u0000${size}`) ?? 0;
  const colorHasStock = (color: string) => sizes.some((size) => available(color, size) > 0);

  const [color, setColor] = useState(() => colors.find(colorHasStock) ?? colors[0] ?? '');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string }>();

  const selectedStock = size ? available(color, size) : 0;
  const max = Math.max(1, Math.min(selectedStock, MAX_PER_ORDER));
  const everything = variants.every((variant) => variant.stock <= 0);

  async function addToCart() {
    const variant = variants.find((item) => item.color === color && item.size === size);
    if (!variant) return;
    setBusy(true); setNote(undefined);
    const result = await callJson('/api/cart/items', { variantId: variant.id, quantity });
    setBusy(false);
    if (!result.ok) { setNote({ ok: false, text: result.error }); return; }
    setNote({ ok: true, text: `Đã thêm ${quantity} × ${productName} (${color} / ${size}) vào giỏ hàng.` });
    router.refresh(); // updates the cart badge in the header
  }

  function chooseColor(next: string) {
    setColor(next);
    if (size && available(next, size) <= 0) setSize('');
    setQuantity(1);
  }

  return (
    <div className="space-y-6">
      {colors.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Màu: <span className="font-normal text-ink-soft">{color}</span></p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Màu sắc">
            {colors.map((item) => {
              const dot = colorDot(item);
              const out = !colorHasStock(item);
              return (
                <button key={item} type="button" role="radio" aria-checked={item === color} onClick={() => chooseColor(item)}
                  className={cn('inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors', item === color ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand', out && item !== color && 'text-ink-muted line-through')}>
                  {dot && <span className="size-4 rounded-full border border-ink/20 ring-1 ring-white" style={{ background: dot }} aria-hidden />}{item}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Size</span><Link href="/chat" className="text-ink-muted underline underline-offset-4 hover:text-ink">Chọn size giúp tôi</Link></div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kích cỡ">
          {sizes.map((item) => {
            const left = available(color, item);
            return (
              <button key={item} type="button" role="radio" aria-checked={item === size} disabled={left <= 0} onClick={() => { setSize(item); setQuantity(1); }}
                className={cn('h-10 min-w-12 rounded-lg border px-3 text-sm font-medium transition-colors', item === size ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand', 'disabled:border-dashed disabled:text-ink-muted/60 disabled:line-through disabled:hover:border-line')}>
                {item}
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-5 text-xs" aria-live="polite">
          {everything ? <span className="text-ink-muted">Sản phẩm tạm hết hàng.</span>
            : !size ? <span className="text-ink-muted">Chọn size để xem tình trạng.</span>
            : selectedStock <= LOW ? <span className="text-warn">Chỉ còn {selectedStock} sản phẩm size {size}.</span>
            : <span className="text-brand">Còn hàng.</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="inline-flex h-12 items-center rounded-md border border-line bg-surface" role="group" aria-label="Số lượng">
          <button type="button" aria-label="Giảm" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)} className="grid size-12 place-items-center text-ink-soft hover:text-ink disabled:opacity-40">−</button>
          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{quantity}</span>
          <button type="button" aria-label="Tăng" disabled={!size || quantity >= max} onClick={() => setQuantity(quantity + 1)} className="grid size-12 place-items-center text-ink-soft hover:text-ink disabled:opacity-40">+</button>
        </div>
        <button type="button" disabled={!size || busy || everything} onClick={() => void addToCart()} className={cn(buttonClass({ variant: 'primary', size: 'lg' }), 'flex-1')}>{everything ? 'Hết hàng' : busy ? 'Đang thêm…' : size ? 'Thêm vào giỏ' : 'Chọn size để thêm vào giỏ'}</button>
      </div>
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={cn('rounded-md px-3 py-2 text-sm', note.ok ? 'bg-brand-soft text-brand' : 'bg-sale-soft text-sale')}>
          {note.text} {note.ok && <Link href="/cart" className="font-medium underline">Xem giỏ hàng →</Link>}
        </p>
      )}
      <Link href={`/chat`} className={cn(buttonClass({ variant: 'outline' }), 'w-full')} aria-label={`Hỏi trợ lý AI về ${productName}`}>Hỏi trợ lý AI về sản phẩm này</Link>
    </div>
  );
}
