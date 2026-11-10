import { MetricCard, PageHeader, Panel, td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { AlertIcon, ClockIcon, DatabaseIcon, SparkleIcon } from '@/components/admin-ui/icons';
import { recentAlerts } from '@/features/monitoring/alerts';
import { operationalBacklog } from '@/features/monitoring/backlog';
import { builtinMcpHealth } from '@/features/monitoring/mcp-health';
import { monitoringSummary } from '@/features/monitoring/summary';
import { env } from '@/lib/env';
import { breakerStates } from '@/lib/resilience';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monitoring · Admin' };

const ms = (value: number | null) => value === null ? '—' : `${value.toLocaleString('vi-VN')} ms`;
const rate = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const num = (value: number) => value.toLocaleString('vi-VN');
const minutes = (seconds: number | null) => seconds === null ? 'không có' : seconds < 3600 ? `${Math.floor(seconds / 60)} phút` : `${(seconds / 3600).toFixed(1)} giờ`;
const time = (value: Date) => new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const breakerLabel = { closed: 'Đóng (bình thường)', half_open: 'Đang thử lại', open: 'Mở (tạm ngừng gọi)' } as const;
const modeLabel = { off: 'tắt', observe: 'chỉ quan sát, không chặn lời gọi', enforce: 'đang chặn khi mở' } as const;
const dependencyLabel: Record<string, string> = { openai: 'OpenAI', mcp_builtin: 'MCP nội bộ', mcp_external: 'MCP ngoài' };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>;
}

export default async function MonitoringPage() {
  const data = monitoringSummary();
  // DB-backed parts degrade to "—" (for example before migration 0015 ran) instead of failing the page.
  const [backlog, alerts, mcp] = await Promise.all([operationalBacklog().catch(() => null), recentAlerts(15).catch(() => null), builtinMcpHealth()]);
  return <div className="space-y-6">
    <PageHeader title="AI Monitoring" description="Số liệu 24 giờ gần nhất từ log NDJSON cục bộ và database. Không hiển thị prompt, nội dung chat hay dữ liệu khách hàng."
      actions={env.GRAFANA_URL ? <a href={env.GRAFANA_URL} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-500 hover:underline">Mở Grafana ↗</a> : undefined} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
      <MetricCard label="Chat p95" value={ms(data.chat.p95Ms)} icon={<ClockIcon />} tone="brand" hint={`${num(data.chat.count)} lượt hoàn tất · ${num(data.chat.failed)} lỗi`} />
      <MetricCard label="Model p95" value={ms(data.model.p95Ms)} icon={<SparkleIcon />} tone={data.model.failures ? 'warn' : 'brand'} hint={`${num(data.model.calls)} lần gọi · ${num(data.model.failures)} lỗi/timeout`} />
      <MetricCard label="MCP nội bộ" value={mcp.healthy ? 'Hoạt động' : 'Không phản hồi'} icon={<DatabaseIcon />} tone={mcp.healthy ? 'success' : 'danger'} hint={mcp.healthy ? `/health ${mcp.latencyMs} ms` : mcp.error ?? undefined} />
      <MetricCard label="Chờ nhân viên duyệt" value={backlog ? num(backlog.approvalsPending) : '—'} icon={<AlertIcon />} href="/admin/approvals"
        tone={backlog && backlog.approvalOldestSeconds !== null && backlog.approvalOldestSeconds / 60 > env.ALERT_APPROVAL_MAX_AGE_MINUTES ? 'warn' : 'neutral'}
        hint={backlog ? `Cũ nhất: ${minutes(backlog.approvalOldestSeconds)}` : undefined} />
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
      <MetricCard label="Retrieval p95" value={ms(data.retrieval.p95Ms)} icon={<DatabaseIcon />} tone="neutral" hint={`${num(data.retrieval.count)} lượt retrieval`} />
      <MetricCard label="Không tìm thấy context" value={rate(data.retrieval.emptyRate)} icon={<AlertIcon />} tone={data.retrieval.emptyRate && data.retrieval.emptyRate > 0.2 ? 'warn' : 'neutral'} hint="Retrieval không trả chunk nào" />
      <MetricCard label="Câu trả lời bị từ chối" value={num(data.citationRejected)} icon={<SparkleIcon />} tone={data.citationRejected ? 'warn' : 'success'} hint={`Citation/số liệu không hợp lệ · ${num(data.answers)} câu trả lời`} />
      <MetricCard label="Chặn prompt injection" value={num(data.guardBlocked)} icon={<AlertIcon />} tone="neutral" hint={`Chạm giới hạn bước: ${num(data.limitAnswers)}`} />
    </div>

    <Panel title="Dependency & tool">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-y border-gray-100 dark:border-white/5"><tr>
            <th className={th}>Dependency</th><th className={th}>Tool / model</th><th className={thEnd}>Lần gọi</th><th className={thEnd}>p95</th><th className={thEnd}>Lỗi / timeout</th><th className={thEnd}>Tool báo lỗi</th><th className={thEnd}>Tỉ lệ lỗi</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {data.dependencies.length === 0 && <tr><td colSpan={7} className={`${td} text-center text-gray-500`}>Chưa có lần gọi nào trong 24 giờ qua.</td></tr>}
            {data.dependencies.map((entry) => (
              <tr key={`${entry.dependency}:${entry.operation}`}>
                <td className={td}>{dependencyLabel[entry.dependency] ?? entry.dependency}</td>
                <td className={`${td} font-mono text-xs`}>{entry.operation}</td>
                <td className={`${td} text-end tabular-nums`}>{num(entry.calls)}</td>
                <td className={`${td} text-end tabular-nums`}>{ms(entry.p95Ms)}</td>
                <td className={`${td} text-end tabular-nums`}>{num(entry.failures)}</td>
                <td className={`${td} text-end tabular-nums`}>{num(entry.toolErrors)}</td>
                <td className={`${td} text-end tabular-nums`}><Badge size="sm" color={entry.failureRate >= env.ALERT_DEPENDENCY_FAILURE_RATE ? 'error' : entry.failures ? 'warning' : 'success'}>{rate(entry.failureRate)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-theme-xs text-gray-500 sm:px-6 dark:text-gray-400">“Tool báo lỗi” là lỗi nghiệp vụ (ví dụ không tìm thấy đơn), không tính vào tỉ lệ lỗi của dependency.</p>
    </Panel>

    <Panel title="Circuit breaker (tiến trình web)" action={<span className="text-theme-xs text-gray-500">Chế độ: {modeLabel[env.CIRCUIT_BREAKER_MODE]}</span>}>
      {breakerStates().length === 0
        ? <p className="px-5 pb-5 text-sm text-gray-500 sm:px-6">Chưa có lời gọi nào kể từ khi tiến trình khởi động.</p>
        : <ul className="flex flex-wrap gap-2 px-5 pb-5 sm:px-6">{breakerStates().map((breaker) => (
          <li key={breaker.key}><Badge size="sm" color={breaker.state === 'open' ? 'error' : breaker.state === 'half_open' ? 'warning' : 'success'}><span className="font-mono">{breaker.key}</span>: {breakerLabel[breaker.state]}</Badge></li>))}</ul>}
    </Panel>

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Cảnh báo gần đây">
        {alerts === null ? <p className="px-5 pb-5 text-sm text-gray-500 sm:px-6">Chưa đọc được bảng cảnh báo (cần chạy migration).</p>
          : alerts.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500 sm:px-6">Không có cảnh báo trong 30 ngày qua.</p>
          : <ul className="divide-y divide-gray-100 dark:divide-white/5">{alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 px-5 py-3 text-sm sm:px-6">
              <Badge size="sm" color={alert.severity === 'critical' ? 'error' : 'warning'}>{alert.severity === 'critical' ? 'Nghiêm trọng' : 'Cảnh báo'}</Badge>
              <div className="min-w-0 flex-1"><p className="text-gray-800 dark:text-white/90">{alert.message}</p><p className="mt-0.5 text-theme-xs text-gray-500">{time(alert.fired_at)}{alert.notified ? ' · đã gửi webhook' : ''}</p></div>
            </li>))}</ul>}
      </Panel>
      <div className="space-y-6">
        <Panel title="An toàn & vận hành"><dl className="space-y-3 px-5 pb-5 text-sm sm:px-6">
          <Row label="Lỗi/timeout dependency" value={`${num(data.dependencyFailures)} / ${num(data.dependencyCalls)}`} />
          <Row label="Khách đang chờ bấm xác nhận" value={backlog ? num(backlog.confirmationsPending) : '—'} />
          <Row label="Tài liệu chờ duyệt an toàn" value={num(data.reviewRequired)} />
          <Row label="Job index lỗi (24 giờ)" value={backlog ? num(backlog.ingestionFailed24h) : '—'} />
          <Row label="Rate limit cho phép / từ chối" value={`${num(data.rateLimit.allowed)} / ${num(data.rateLimit.rejected)}`} />
        </dl></Panel>
        <Panel title="Token"><dl className="space-y-3 px-5 pb-5 text-sm sm:px-6">
          <Row label="Input" value={num(data.tokens.input)} />
          <Row label="Output" value={num(data.tokens.output)} />
          <Row label="Embedding" value={num(data.tokens.embedding)} />
        </dl></Panel>
      </div>
    </div>
  </div>;
}
