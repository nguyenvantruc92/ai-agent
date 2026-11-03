const tones = {
  neutral: 'bg-sand text-ink-soft',
  brand: 'bg-brand-soft text-brand',
  sale: 'bg-sale-soft text-sale',
  warn: 'bg-warn-soft text-warn',
  'brand-solid': 'bg-brand text-white',
  'sale-solid': 'bg-sale text-white',
  dark: 'bg-ink/80 text-white',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
