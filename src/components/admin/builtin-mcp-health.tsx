import { Panel } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { builtinMcpActivity, builtinMcpHealth } from '@/features/monitoring/mcp-health';
import { internalMcpTokenSource } from '@/mcp/internal-auth';

const tokenText = { dedicated: 'Token riêng (INTERNAL_MCP_TOKEN)', derived: 'Suy ra từ ADMIN_SESSION_SECRET: nên đặt INTERNAL_MCP_TOKEN riêng', missing: 'Chưa cấu hình: MCP từ chối mọi lời gọi' } as const;

/** Server component for the built-in MCP server page. Never shows the token, only where it comes from. */
export async function BuiltinMcpHealth() {
  const [health, activity] = await Promise.all([builtinMcpHealth(), Promise.resolve(builtinMcpActivity())]);
  const source = internalMcpTokenSource();
  return (
    <Panel title="Tình trạng MCP nội bộ" action={<Badge color={health.healthy ? 'success' : 'error'}>{health.healthy ? 'Hoạt động' : 'Không phản hồi'}</Badge>}>
      <dl className="grid gap-3 px-5 pb-5 text-sm sm:grid-cols-2 sm:px-6">
        <div><dt className="text-gray-500 dark:text-gray-400">/health</dt><dd className="font-medium text-gray-800 dark:text-white/90">{health.healthy ? `${health.latencyMs} ms` : health.error ?? 'Lỗi không rõ'}</dd></div>
        <div><dt className="text-gray-500 dark:text-gray-400">Xác thực web ↔ MCP</dt><dd className={source === 'dedicated' ? 'font-medium text-gray-800 dark:text-white/90' : 'font-medium text-orange-600'}>{tokenText[source]}</dd></div>
        <div><dt className="text-gray-500 dark:text-gray-400">Lần gọi 24 giờ (lỗi/timeout)</dt><dd className="font-medium tabular-nums text-gray-800 dark:text-white/90">{activity.calls.toLocaleString('vi-VN')} ({activity.failures.toLocaleString('vi-VN')})</dd></div>
        <div><dt className="text-gray-500 dark:text-gray-400">Lỗi gần nhất</dt><dd className="text-gray-800 dark:text-white/90">{activity.lastFailure
          ? <><span className="font-mono text-xs">{activity.lastFailure.operation}</span> · {new Date(activity.lastFailure.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}<span className="mt-0.5 block text-xs text-gray-500">{activity.lastFailure.error ?? ''}</span></>
          : 'Không có'}</dd></div>
      </dl>
    </Panel>
  );
}
