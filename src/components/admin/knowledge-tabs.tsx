import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Scopes group files into tools the model can call; Files are the uploaded documents themselves. */
export function KnowledgeTabs({ active }: { active: 'scopes' | 'files' }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={cn('border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', on ? 'border-brand-500 text-brand-500 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white')}>{label}</Link>
  );
  return <nav aria-label="Knowledge" className="flex gap-1 border-b border-gray-200 dark:border-gray-800">{tab('/admin/knowledge', 'Knowledge scope', active === 'scopes')}{tab('/admin/knowledge?tab=files', 'Tài liệu', active === 'files')}</nav>;
}
