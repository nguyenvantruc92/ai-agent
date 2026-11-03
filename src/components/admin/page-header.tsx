import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-title-sm font-semibold text-gray-800 sm:text-title-lg dark:text-white/90">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const toneBox = {
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90',
  brand: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
  warn: 'bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400',
  danger: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400',
  success: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
} as const;

/** TailAdmin "metric" card: icon chip, label, big number. */
export function MetricCard({ label, value, hint, icon, tone = 'neutral', href }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: keyof typeof toneBox; href?: string }) {
  const body = (
    <>
      <span className={cn('flex size-12 items-center justify-center rounded-xl [&_svg]:size-6', toneBox[tone])}>{icon}</span>
      <div className="mt-5">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <h4 className="mt-2 text-title-sm font-bold tabular-nums text-gray-800 dark:text-white/90">{value}</h4>
        {hint && <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    </>
  );
  const cls = 'block rounded-2xl border border-gray-200 bg-white p-5 transition-shadow md:p-6 dark:border-gray-800 dark:bg-white/3';
  return href ? <a href={href} className={cn(cls, 'hover:shadow-theme-md')}>{body}</a> : <div className={cls}>{body}</div>;
}

/** Bordered section with a title row; children bring their own padding when they are lists or tables. */
export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3', className)}>
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-gray-100 text-gray-500 [&_svg]:size-6 dark:bg-gray-800 dark:text-gray-400">{icon}</span>
      <p className="mt-3 font-medium text-gray-800 dark:text-white/90">{title}</p>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export const th = 'px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400';
/** Right-aligned header for numeric columns (a separate constant: `text-start` and `text-end` would conflict). */
export const thEnd = 'px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400';
export const td = 'px-5 py-3.5 text-theme-sm text-gray-700 dark:text-gray-300';
