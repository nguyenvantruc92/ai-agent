'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoIcon } from '@/components/admin-ui/icons';
import { cn } from '@/lib/cn';

const WIDTH = 288;
const GAP = 8;
const MARGIN = 12;

type Box = { left: number; right: number; top: number; bottom: number };

/** Where the bubble goes: centred on the icon, kept inside the viewport, above the icon unless there is no room. */
export function tipPosition(anchor: Box, tipHeight: number, viewport: { width: number; height: number }) {
  const width = Math.min(WIDTH, viewport.width - MARGIN * 2);
  const centre = (anchor.left + anchor.right) / 2;
  const left = Math.max(MARGIN, Math.min(centre - width / 2, viewport.width - width - MARGIN));
  const above = anchor.top - tipHeight - GAP;
  const top = above >= MARGIN ? above : Math.min(anchor.bottom + GAP, Math.max(MARGIN, viewport.height - tipHeight - MARGIN));
  return { left, top, width };
}

/**
 * An "!" icon that shows `children` in a bubble on hover, keyboard focus or tap. Used after a field label instead of grey help
 * text under the input. The trigger is a span (not a button) so that inside a <label> the label still belongs to the input.
 */
export function InfoTip({ children, className, label = 'Xem mô tả' }: { children: ReactNode; className?: string; label?: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) { setPlace(null); return; }
    const place = () => setPlace(tipPosition(anchor.current!.getBoundingClientRect(), bubble.current!.offsetHeight, { width: window.innerWidth, height: window.innerHeight }));
    place();
    const close = () => setOpen(false);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', close, true); };
  }, [open]);

  return (
    <>
      <span
        ref={anchor} role="button" tabIndex={0} aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
        className={cn('inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-gray-400 outline-hidden transition-colors hover:text-brand-500 focus-visible:text-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-gray-500', className)}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen((value) => !value); }
        }}
      >
        <InfoIcon className="size-4" aria-hidden />
      </span>
      {open && createPortal(
        <span
          ref={bubble} id={id} role="tooltip"
          style={{ position: 'fixed', left: place?.left ?? 0, top: place?.top ?? 0, width: place?.width ?? WIDTH, visibility: place ? 'visible' : 'hidden' }}
          className="pointer-events-none z-[1000] block rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg ring-1 ring-white/10"
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}
