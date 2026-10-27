const labels: Record<string, { text: string; className: string }> = {
  pending: { text: 'uploaded', className: 'bg-stone-100 text-stone-700' },
  uploaded: { text: 'uploaded', className: 'bg-stone-100 text-stone-700' },
  processing: { text: 'processing', className: 'bg-amber-100 text-amber-800' },
  ready: { text: 'ready', className: 'bg-emerald-100 text-emerald-800' },
  completed: { text: 'completed', className: 'bg-emerald-100 text-emerald-800' },
  failed: { text: 'failed', className: 'bg-red-100 text-red-800' },
  approved: { text: 'approved', className: 'bg-emerald-100 text-emerald-800' },
  rejected: { text: 'rejected', className: 'bg-red-100 text-red-800' },
  expired: { text: 'expired', className: 'bg-stone-200 text-stone-700' },
};

export function StatusBadge({ status }: { status: string }) {
  const label = labels[status] ?? { text: status, className: 'bg-stone-100 text-stone-700' };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${label.className}`}>{label.text}</span>;
}
