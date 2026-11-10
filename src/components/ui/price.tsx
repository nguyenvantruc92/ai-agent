import { formatVnd } from '@/lib/format';

export function Price({ value, oldValue, size = 'md' }: { value: number; oldValue?: number | null; size?: 'md' | 'lg' }) {
  const onSale = oldValue != null && oldValue > value;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`font-semibold tabular-nums ${size === 'lg' ? 'text-2xl' : 'text-base'} ${onSale ? 'text-sale' : 'text-ink'}`}>{formatVnd(value)}</span>
      {onSale && <s className="text-sm tabular-nums text-ink-muted">{formatVnd(oldValue)}</s>}
    </span>
  );
}
