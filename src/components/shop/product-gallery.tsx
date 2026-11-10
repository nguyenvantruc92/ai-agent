'use client';

import { useState } from 'react';
import { Garment } from '@/components/shop/garment';
import { cn } from '@/lib/cn';

type Image = { id: string; url: string; alt: string };

/** Main photo plus thumbnails. Without photos it shows a neutral placeholder block. */
export function ProductGallery({ images, name }: { images: Image[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-gradient-to-br from-[#ede9fe] to-[#fae8ff]" role="img" aria-label={`${name} (chưa có ảnh)`}>
        <Garment className="absolute inset-[22%] text-brand/25" />
      </div>
    );
  }
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- local files with immutable caching */}
      <img src={current.url} alt={current.alt} className="aspect-[4/5] w-full rounded-card bg-sand object-cover shadow-card" />
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2" aria-label="Ảnh sản phẩm">
          {images.map((image, i) => (
            <li key={image.id}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Xem ảnh ${i + 1}`} aria-current={i === index}
                className={cn('block w-full overflow-hidden rounded-md border-2 transition-colors', i === index ? 'border-brand' : 'border-transparent hover:border-line')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local thumbnails */}
                <img src={image.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
