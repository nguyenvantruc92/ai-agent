'use client';

import { useState } from 'react';
import { Garment } from '@/components/shop/garment';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { cn } from '@/lib/cn';

type Image = { id: string; url: string; alt: string };

/** Main photo plus thumbnails. Without photos it shows a neutral placeholder block. */
export function ProductGallery({ images, name }: { images: Image[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState(false);
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
      <button type="button" onClick={() => setViewing(true)} aria-label="Xem ảnh lớn" className="group block w-full cursor-zoom-in overflow-hidden rounded-card bg-sand shadow-card focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- local files with immutable caching */}
        <img src={current.url} alt={current.alt} className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105" />
      </button>
      <ImageLightbox images={images} index={Math.min(index, images.length - 1)} open={viewing} onIndexChange={setIndex} onOpenChange={setViewing} />
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
