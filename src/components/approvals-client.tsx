'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';

type Approval = { id: string; thread_id: string; action: 'exchange_size' | 'return'; payload: Record<string, string>; summary: string; source_ids: string[]; status: string; reviewer: string | null; note: string | null; created_at: string; decided_at: string | null; expires_at: string };

const time = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function ApprovalsClient() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/approvals');
    if (response.status === 401) { router.push('/admin/login'); return; }
    setApprovals(await response.json());
  }, [router]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(), 5_000); return () => clearInterval(timer); }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id); setMessage('');
    const response = await fetch(`/api/admin/approvals/${id}/${decision}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: notes[id] ?? '' }) });
    const data = await response.json().catch(() => ({})) as { error?: string; answer?: string | null; traceId?: string };
    setMessage(response.ok ? `Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} và gửi phản hồi cho khách${data.answer ? `: “${data.answer}”` : '.'}` : `${data.error ?? 'Thao tác thất bại.'} (trace ${data.traceId ?? '—'})`);
    setBusy(undefined);
    await load();
  }

  const pending = approvals.filter((approval) => approval.status === 'pending');
  const decided = approvals.filter((approval) => approval.status !== 'pending');
  return <main className="mx-auto max-w-5xl p-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Duyệt yêu cầu đổi/trả</h1><p className="mt-1 text-sm text-stone-600">Agent dừng tại bước này; chỉ sau khi duyệt mới gọi tool ghi dữ liệu. Không sửa được payload.</p></div>
      <div className="flex gap-4 text-sm"><Link className="underline" href="/admin/knowledge">Knowledge</Link><Link className="underline" href="/chat">Mở chat</Link></div>
    </div>
    {message && <p className="mt-4 rounded border bg-white p-3 text-sm">{message}</p>}

    <h2 className="mt-8 font-semibold">Đang chờ ({pending.length})</h2>
    <div className="mt-3 space-y-3">
      {pending.length === 0 && <p className="text-sm text-stone-500">Không có yêu cầu nào đang chờ.</p>}
      {pending.map((approval) => <article key={approval.id} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{approval.summary}</p>
            <p className="mt-1 text-xs text-stone-500">{approval.action === 'exchange_size' ? 'Đổi size' : 'Trả hàng'} · tạo {time(approval.created_at)} · hết hạn {time(approval.expires_at)}</p>
            <pre className="mt-2 rounded bg-stone-50 p-2 text-xs">{JSON.stringify(approval.payload, null, 2)}</pre>
            <p className="mt-1 text-xs text-stone-500">Nguồn: {approval.source_ids.join(', ') || '—'}</p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <input className="rounded border p-2 text-sm" placeholder="Ghi chú cho khách (tùy chọn)" value={notes[approval.id] ?? ''} onChange={(e) => setNotes({ ...notes, [approval.id]: e.target.value })} />
            <div className="flex gap-2">
              <button className="flex-1 rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy === approval.id} onClick={() => void decide(approval.id, 'approve')}>Duyệt</button>
              <button className="flex-1 rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50" disabled={busy === approval.id} onClick={() => void decide(approval.id, 'reject')}>Từ chối</button>
            </div>
          </div>
        </div>
      </article>)}
    </div>

    <h2 className="mt-8 font-semibold">Đã xử lý</h2>
    <div className="mt-3 overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead className="bg-stone-100"><tr><th className="p-3">Yêu cầu</th><th className="p-3">Trạng thái</th><th className="p-3">Người duyệt</th><th className="p-3">Ghi chú</th><th className="p-3">Thời điểm</th></tr></thead>
      <tbody>{decided.map((approval) => <tr key={approval.id} className="border-t">
        <td className="p-3">{approval.summary}</td>
        <td className="p-3"><StatusBadge status={approval.status} /></td>
        <td className="p-3">{approval.reviewer ?? '—'}</td>
        <td className="p-3">{approval.note ?? '—'}</td>
        <td className="p-3">{time(approval.decided_at)}</td>
      </tr>)}</tbody>
    </table></div>
  </main>;
}
