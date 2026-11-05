import { Badge } from '@/components/admin-ui/badge';

type Color = 'gray' | 'warning' | 'success' | 'error';
const colors: Record<string, Color> = {
  pending: 'gray', uploaded: 'gray', expired: 'gray',
  processing: 'warning', review: 'warning', needs_review: 'warning', pending_scan: 'warning',
  ready: 'success', completed: 'success', approved: 'success',
  failed: 'error', rejected: 'error',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={colors[status] ?? 'gray'} size="sm">{status}</Badge>;
}
