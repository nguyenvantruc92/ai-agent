/**
 * Tomodev mark: a clothes hanger on the brand gradient. The same drawing is `src/app/icon.svg` (favicon), so keep them in sync.
 * Size it with `className` (for example `size-8`); the wordmark is plain text next to it.
 */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Tomodev">
      <defs>
        <linearGradient id="tomodev-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#tomodev-logo-gradient)" />
      <g fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 2)">
        <path d="M32 30v-4.5a5.5 5.5 0 1 0-5.5-5.5" />
        <path d="M32 30 11.5 44.5h41Z" />
      </g>
    </svg>
  );
}
