'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Same look as the TailAdmin Input, for native <select> (which submits plain values in GET forms). */
export const selectClass = 'h-11 w-full rounded-[10px] border border-gray-300 bg-white px-4 text-sm text-gray-800 shadow-theme-xs outline-hidden transition-colors focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-100/50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-500/40';

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(selectClass, className)} />;
}

export function FormField({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-400">{label}</span>
      {children}
      {hint && <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </label>
  );
}
