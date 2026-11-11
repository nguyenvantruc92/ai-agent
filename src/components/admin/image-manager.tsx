'use client';

import { ChangeEvent, useState } from 'react';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { Button } from '@/components/admin-ui/button';
import { ArrowLeftIcon, ArrowRightIcon, TrashBinIcon, UploadIcon } from '@/components/admin-ui/icons';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import type { ImageRow } from '@/features/catalog/admin-repository';
import { cn } from '@/lib/cn';
import { callApi } from '@/lib/client-api';

/** Upload, reorder and delete product images. The first image is the cover. */
export function ImageManager({ productId, initial }: { productId: string; initial: ImageRow[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [images, setImages] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setBusy(true);
    for (const file of files) {
      const body = new FormData(); body.set('file', file);
      const result = await callApi<ImageRow>(`/api/admin/products/${productId}/images`, { method: 'POST', body });
      if (!result.ok) { toast('error', `${file.name}: ${result.error}`); break; }
      setImages((current) => [...current, result.data]);
    }
    setBusy(false);
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    const result = await callApi(`/api/admin/products/${productId}/images`, { method: 'PUT', json: { order: next.map((image) => image.id) } });
    if (!result.ok) { toast('error', result.error); setImages(images); }
  }

  async function remove(image: ImageRow) {
    if (!(await confirm({ title: 'Xóa ảnh này?', message: 'Ảnh sẽ không còn hiển thị trên sản phẩm.', confirmLabel: 'Xóa ảnh', danger: true }))) return;
    const result = await callApi(`/api/admin/products/${productId}/images/${image.id}`, { method: 'DELETE' });
    if (!result.ok) { toast('error', result.error); return; }
    toast('success', 'Đã xóa ảnh.');
    setImages((current) => current.filter((item) => item.id !== image.id));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Ảnh sản phẩm</h2>
      <label className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500', busy && 'pointer-events-none opacity-60')}>
        <span className="grid size-11 place-items-center rounded-full bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400"><UploadIcon className="size-5" /></span>
        <span className="text-sm font-medium text-gray-800 dark:text-white/90">{busy ? 'Đang tải ảnh…' : 'Bấm để chọn ảnh'}</span>
        <span className="text-theme-xs text-gray-500 dark:text-gray-400">JPG, PNG hoặc WebP · tối đa 2 MB mỗi ảnh · tối đa 8 ảnh</span>
        <input type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event)} />
      </label>
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {images.map((image, index) => (
            <li key={image.id} className="space-y-1.5">
              <div className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                <button type="button" onClick={() => setViewing(index)} aria-label={`Xem ảnh ${index + 1} cỡ lớn`} className="block size-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none focus-visible:ring-inset">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local admin preview */}
                  <img src={image.url} alt={image.alt} className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" />
                </button>
                {index === 0 && <span className="absolute top-2 left-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-[11px] font-medium text-white">Ảnh bìa</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="flex gap-1">
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Chuyển lên" disabled={index === 0} onClick={() => void move(index, -1)}><ArrowLeftIcon className="size-4" /></Button>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Chuyển xuống" disabled={index === images.length - 1} onClick={() => void move(index, 1)}><ArrowRightIcon className="size-4" /></Button>
                </span>
                <Button type="button" size="icon-xs" variant="ghost" className="text-red-500 hover:text-red-600" aria-label="Xóa ảnh" onClick={() => void remove(image)}><TrashBinIcon className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && <ImageLightbox images={images} index={viewing ?? 0} open={viewing !== null} onIndexChange={setViewing} onOpenChange={(open) => { if (!open) setViewing(null); }} />}
    </section>
  );
}
