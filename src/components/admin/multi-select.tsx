'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon, XIcon } from '@/components/admin-ui/icons';
import { cn } from '@/lib/cn';

export type MultiSelectOption = { value: string; label: string; description?: ReactNode; disabled?: boolean };

/** A dropdown with checkboxes: pick several options; the choices show as removable chips in the closed field. */
export function MultiSelect({ options, value, onChange, placeholder = 'Chọn…', emptyText = 'Không có lựa chọn.', label }: {
  options: MultiSelectOption[]; value: string[]; onChange: (value: string[]) => void; placeholder?: string; emptyText?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const toggle = (item: string) => onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item]);
  const selected = value.map((item) => options.find((option) => option.value === item) ?? { value: item, label: item });

  return (
    <div ref={root} className="relative">
      <div role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={label}
        onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen((current) => !current); } }}
        className={cn('flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-theme-xs outline-hidden transition-colors focus-visible:border-brand-300 focus-visible:ring-3 focus-visible:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900', open && 'border-brand-300 ring-3 ring-brand-500/20')}>
        <span className="flex flex-1 flex-wrap items-center gap-1.5">
          {selected.length === 0 && <span className="px-1 text-gray-400">{placeholder}</span>}
          {selected.map((item) => (
            <span key={item.value} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 py-0.5 ps-2.5 pe-1 text-sm text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              {item.label}
              <button type="button" aria-label={`Bỏ ${item.label}`} className="grid size-5 place-items-center rounded-md hover:bg-brand-100 dark:hover:bg-brand-500/25" onClick={(event) => { event.stopPropagation(); toggle(item.value); }}><XIcon className="size-3.5" /></button>
            </span>
          ))}
        </span>
        <ChevronDownIcon className={cn('size-5 shrink-0 text-gray-500 transition-transform', open && 'rotate-180')} />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-multiselectable className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
          {options.length === 0 && <li className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{emptyText}</li>}
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={value.includes(option.value)} aria-disabled={option.disabled}>
              <label className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5')}>
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-500" disabled={option.disabled && !value.includes(option.value)} checked={value.includes(option.value)} onChange={() => toggle(option.value)} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-800 dark:text-white/90">{option.label}</span>{option.description && <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">{option.description}</span>}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
