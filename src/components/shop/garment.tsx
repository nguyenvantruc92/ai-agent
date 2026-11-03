/** Generic tee silhouette used where a product has no photo yet. Purely decorative. */
export function Garment({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8.5 3 3 5.8l1.9 4.1 2.6-1.1V21h9V8.8l2.6 1.1L21 5.8 15.5 3a3.6 3.6 0 0 1-7 0Z" />
    </svg>
  );
}
