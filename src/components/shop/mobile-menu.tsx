'use client';

import { useState } from 'react';
import Link from 'next/link';

type Item = { href: string; label: string };

/** Hamburger drawer for the shop header on small screens. */
export function MobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button aria-label={open ? 'Đóng menu' : 'Mở menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-10 place-items-center rounded-full hover:bg-sand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="size-5" aria-hidden><path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
      </button>
      {open && (
        <nav aria-label="Danh mục" className="absolute inset-x-0 top-full border-b border-line bg-white px-4 py-3 shadow-card">
          <ul className="grid grid-cols-2 gap-1">
            {items.map((item) => <li key={item.href}><Link href={item.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-ink-soft hover:bg-sand hover:text-brand">{item.label}</Link></li>)}
          </ul>
        </nav>
      )}
    </div>
  );
}
