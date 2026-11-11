'use client';

import { Dialog } from '@base-ui/react/dialog';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export type LightboxImage = { url: string; alt?: string };

const control = 'grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-30';

/**
 * Full-screen image viewer shared by the shop and the admin. Built on the Base UI dialog, so it traps focus, locks page scroll and
 * closes with Esc or a click outside the photo. Left/right arrow keys (or the buttons) move between photos; clicking the photo
 * toggles a 2x zoom around the point you clicked.
 */
export function ImageLightbox({ images, index, open, onIndexChange, onOpenChange }: {
  images: LightboxImage[]; index: number; open: boolean; onIndexChange: (index: number) => void; onOpenChange: (open: boolean) => void;
}) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const image = images[Math.min(index, images.length - 1)];
  const many = images.length > 1;
  const go = (step: number) => { setZoom(null); onIndexChange((index + step + images.length) % images.length); };
  if (!image) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) setZoom(null); onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-[100000] grid place-items-center p-3 sm:p-8">
          <Dialog.Popup
            className="relative flex max-h-full max-w-full items-center justify-center outline-none transition duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            onKeyDown={(event) => {
              if (!many) return;
              if (event.key === 'ArrowLeft') go(-1);
              if (event.key === 'ArrowRight') go(1);
            }}
          >
            <Dialog.Title className="sr-only">{image.alt || 'Ảnh sản phẩm'}</Dialog.Title>
            <div className="overflow-hidden rounded-xl bg-black/20 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- local product photos */}
              <img
                src={image.url}
                alt={image.alt ?? ''}
                draggable={false}
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const pct = (value: number) => Math.min(100, Math.max(0, value * 100));
                  setZoom(zoom ? null : { x: pct((event.clientX - box.left) / box.width), y: pct((event.clientY - box.top) / box.height) });
                }}
                style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                className={cn('block max-h-[calc(100dvh-5rem)] max-w-full object-contain transition-transform duration-300 ease-out select-none sm:max-h-[calc(100dvh-8rem)]', zoom ? 'scale-[2] cursor-zoom-out' : 'cursor-zoom-in')}
              />
            </div>
            <Dialog.Close className={cn(control, 'fixed top-3 right-3 sm:top-5 sm:right-5')} aria-label="Đóng">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </Dialog.Close>
            {many && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Ảnh trước" className={cn(control, 'fixed top-1/2 left-3 -translate-y-1/2 sm:left-5')}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 5-7 7 7 7" /></svg>
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Ảnh sau" className={cn(control, 'fixed top-1/2 right-3 -translate-y-1/2 sm:right-5')}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
                </button>
                <span className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur" aria-live="polite">{Math.min(index, images.length - 1) + 1} / {images.length}</span>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A photo that opens in the lightbox when clicked, with a smooth zoom-in on hover that eases back out on leave.
 * `className` styles the <img>, `buttonClassName` the clickable frame (give it the size and rounding).
 */
export function ZoomableImage({ src, alt = '', className, buttonClassName, label = 'Xem ảnh lớn' }: {
  src: string; alt?: string; className?: string; buttonClassName?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className={cn('group block cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none', buttonClassName)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local product photos */}
        <img src={src} alt={alt} className={cn('size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110', className)} />
      </button>
      <ImageLightbox images={[{ url: src, alt }]} index={0} open={open} onIndexChange={() => {}} onOpenChange={setOpen} />
    </>
  );
}
