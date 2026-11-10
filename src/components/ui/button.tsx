import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'brand' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-hover',
  brand: 'bg-gradient-to-r from-brand to-accent text-white shadow-sm shadow-brand/25 hover:brightness-110',
  outline: 'border border-line bg-surface text-ink hover:border-brand hover:text-brand',
  ghost: 'text-ink-soft hover:bg-sand hover:text-brand',
  danger: 'bg-sale text-white hover:bg-sale/90',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };

/** Class string so <Link> and <a> can look like buttons without wrapping. */
export const buttonClass = ({ variant = 'primary', size = 'md' }: { variant?: Variant; size?: Size } = {}) => `${base} ${variants[variant]} ${sizes[size]}`;

export function Button({ variant, size, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={`${buttonClass({ variant, size })} ${className}`} />;
}
