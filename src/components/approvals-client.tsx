'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/feedback';
import { EmptyState, PageHeader, td, th } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { CheckCircleIcon } from '@/components/admin-ui/icons';
import { Input } from '@/components/admin-ui/input';

type Approval = { id: string; thread_id: string; action: 'exchange_size' | 'return' | 'mcp_tool'; payload: Record<string, string>; summary: string; source_ids: string[]; status: string; reviewer: string | null; note: string | null; created_at: string; decided_at: string | null; expires_at: string };

const actionLabel = { exchange_size: 'Đổi size', return: 'Trả hàng', mcp_tool: 'Tool MCP ngoài' } as const;

/** The payload as staff should read it: for an external tool call, the tool and its arguments rather than a JSON string inside JSON. */
function describePayload(approval: Pick<Approval, 'action' | 'payload'>) {
  if (approval.action !== 'mcp_tool') return approval.payload;
  let args: unknown = approval.payload.args;
  try { args = JSON.parse(approval.payload.args ?? '{}'); } catch { /* shown as text */ }
  return { 'MCP server': approval.payload.server_name, tool: approval.payload.tool, 'tham số': args };
}

const time = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function ApprovalsClient() {
  const router = useRouter();
  const toast = useToast();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/approvals');
    if (response.status === 401) { router.push('/admin/login'); return; }
    setApprovals(await response.json());
    setLoaded(true);
  }, [router]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(), 5_000); return () => clearInterval(timer); }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    const response = await fetch(`/api/admin/approvals/${id}/${decision}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: notes[id] ?? '' }) });
    const data = await response.json().catch(() => ({})) as { error?: string; answer?: string | null; traceId?: string };
    if (response.ok) toast('success', `Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} và gửi phản hồi cho khách${data.answer ? `: “${data.answer}”` : '.'}`);
    else toast('error', `${data.error ?? 'Thao tác thất bại.'} (trace ${data.traceId ?? '—'})`);
    setBusy(undefined);
    await load();
  }

  const pending = approvals.filter((approval) => approval.status === 'pending');
  const decided = approvals.filter((approval) => approval.status !== 'pending');
  return (
    <div className="space-y-6">
      <PageHeader title="Phê duyệt" description="Agent dừng tại bước này; chỉ sau khi duyệt mới gọi tool ghi dữ liệu. Không sửa được payload." />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">Đang chờ <Badge color={pending.length ? 'error' : 'gray'} size="sm">{pending.length}</Badge></h2>
        {loaded && pending.length === 0 && <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"><EmptyState icon={<CheckCircleIcon />} title="Không có yêu cầu nào đang chờ" /></div>}
        {pending.map((approval) => (
          <article key={approval.id} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl">
                <p className="font-medium text-gray-800 dark:text-white/90">{approval.summary}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400"><Badge color="info" size="sm">{actionLabel[approval.action]}</Badge>tạo {time(approval.created_at)} · hết hạn {time(approval.expires_at)}</p>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-700 dark:bg-white/3 dark:text-gray-300">{JSON.stringify(describePayload(approval), null, 2)}</pre>
                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">Nguồn: {approval.source_ids.join(', ') || '—'}</p>
              </div>
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Input placeholder="Ghi chú cho khách (tùy chọn)" value={notes[approval.id] ?? ''} onChange={(e) => setNotes({ ...notes, [approval.id]: e.target.value })} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={busy === approval.id} onClick={() => void decide(approval.id, 'approve')}>Duyệt</Button>
                  <Button variant="outline" className="flex-1 border-red-300 text-red-500 hover:text-red-600" disabled={busy === approval.id} onClick={() => void decide(approval.id, 'reject')}>Từ chối</Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Đã xử lý</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-gray-100 dark:border-white/5"><tr><th className={th}>Yêu cầu</th><th className={th}>Trạng thái</th><th className={th}>Người duyệt</th><th className={th}>Ghi chú</th><th className={th}>Thời điểm</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {decided.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">Chưa có yêu cầu nào được xử lý.</td></tr>}
                {decided.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                    <td className={td}>{approval.summary}</td>
                    <td className={td}><StatusBadge status={approval.status} /></td>
                    <td className={td}>{approval.reviewer ?? '—'}</td>
                    <td className={td}>{approval.note ?? '—'}</td>
                    <td className={td}>{time(approval.decided_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
