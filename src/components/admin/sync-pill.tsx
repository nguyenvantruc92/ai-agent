import { Badge } from '@/components/admin-ui/badge';
import { AlertIcon, CheckIcon, ClockIcon, RegenerateIcon } from '@/components/admin-ui/icons';
import type { SyncState } from '@/features/catalog/dashboard';

const view = {
  ok: { text: 'Chatbot đã đồng bộ', color: 'success' as const, Icon: CheckIcon },
  syncing: { text: 'Đang đồng bộ chatbot…', color: 'warning' as const, Icon: RegenerateIcon },
  failed: { text: 'Đồng bộ chatbot lỗi', color: 'error' as const, Icon: AlertIcon },
  none: { text: 'Chưa đồng bộ chatbot', color: 'gray' as const, Icon: ClockIcon },
};

export function SyncPill({ sync }: { sync: SyncState }) {
  const { text, color, Icon } = view[sync.state];
  return (
    <span title={sync.error ?? (sync.at ? `Lần gần nhất: ${new Date(sync.at).toLocaleString('vi-VN')}` : undefined)}>
      <Badge color={color} size="lg"><Icon className={sync.state === 'syncing' ? 'animate-spin' : ''} />{text}</Badge>
    </span>
  );
}
