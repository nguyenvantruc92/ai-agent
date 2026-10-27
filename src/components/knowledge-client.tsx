'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';

type Document = { id: string; original_filename: string; status: string; created_at: string; version?: number; version_status?: string; active_version?: number | null; error?: string | null };
type RetrievalResult = { traceId: string; chunks: { source_id: string; title: string; similarity: number }[]; queries: { name: string; thresholded: boolean; results: { id: string; score: number }[] }[] };

export default function KnowledgeClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [retrieval, setRetrieval] = useState<RetrievalResult>();

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/documents');
    if (response.status === 401) { router.push('/admin/login'); return; }
    setDocuments(await response.json());
  }, [router]);

  const inProgress = documents.some((doc) => ['pending', 'processing'].includes(doc.version_status ?? doc.status));
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  // Poll only while a version is still being indexed.
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => void load(), 2_000);
    return () => clearInterval(timer);
  }, [load, inProgress]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    const body = new FormData(); body.set('file', file);
    const response = await fetch('/api/admin/documents', { method: 'POST', body });
    if (!response.ok) setError((await response.json()).error ?? 'Upload thất bại.');
    await load(); setBusy(false); event.target.value = '';
  }
  async function reindex(id: string) { await fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }); await load(); }
  async function remove(id: string) { if (confirm('Xóa mềm tài liệu này?')) { await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' }); await load(); } }
  async function logout() { await fetch('/api/admin/session', { method: 'DELETE' }); router.push('/admin/login'); }
  async function testRetrieval(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    const response = await fetch('/api/admin/retrieval-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: question }) });
    if (response.ok) setRetrieval(await response.json());
    else setError((await response.json()).error ?? 'Không chạy được retrieval test.');
  }

  return <main className="mx-auto max-w-5xl p-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Knowledge</h1><p className="mt-1 text-sm text-stone-600">PDF chính sách và XLSX catalog được index bởi worker. Chat dùng version active cho đến khi version mới ready.</p></div>
      <div className="flex gap-4 text-sm"><Link className="underline" href="/admin/approvals">Duyệt đổi/trả</Link><Link className="underline" href="/chat">Mở chat</Link><button className="underline" onClick={() => void logout()}>Đăng xuất</button></div>
    </div>
    <label className="mt-6 inline-block cursor-pointer rounded bg-stone-900 px-4 py-2 text-sm text-white">{busy ? 'Đang upload…' : 'Upload PDF/XLSX'}<input className="hidden" type="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={upload} /></label>
    {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-6 overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead className="bg-stone-100"><tr><th className="p-3">File</th><th className="p-3">Active</th><th className="p-3">Version mới nhất</th><th className="p-3">Thao tác</th></tr></thead>
      <tbody>{documents.map((doc) => <tr key={doc.id} className="border-t">
        <td className="p-3"><Link className="underline" href={`/admin/knowledge/${doc.id}`}>{doc.original_filename}</Link>{doc.error && <p className="mt-1 text-xs text-red-700">{doc.error}</p>}</td>
        <td className="p-3">{doc.active_version ? `v${doc.active_version}` : '—'}</td>
        <td className="p-3">v{doc.version ?? 1} <StatusBadge status={doc.version_status ?? doc.status} /></td>
        <td className="space-x-3 p-3"><button className="underline" onClick={() => void reindex(doc.id)}>Re-index</button><button className="text-red-700 underline" onClick={() => void remove(doc.id)}>Xóa</button></td>
      </tr>)}</tbody>
    </table></div>

    <section className="mt-8 rounded border bg-white p-4">
      <h2 className="font-semibold">Kiểm tra retrieval</h2>
      <form className="mt-3 flex gap-2" onSubmit={testRetrieval}>
        <input className="flex-1 rounded border p-2 text-sm" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ví dụ: Phí giao hàng bao nhiêu?" />
        <button className="rounded bg-stone-900 px-4 text-sm text-white">Chạy</button>
      </form>
      {retrieval && <div className="mt-4 space-y-3 text-sm">
        <p className="text-xs text-stone-500">Trace: {retrieval.traceId}</p>
        <div><p className="font-medium">Context đưa vào prompt ({retrieval.chunks.length})</p>
          {retrieval.chunks.length ? retrieval.chunks.map((chunk) => <p key={chunk.source_id}><code className="text-xs">{chunk.source_id}</code> · {chunk.title} <span className="text-stone-500">({chunk.similarity.toFixed(3)})</span></p>) : <p className="text-stone-500">Không có chunk đạt ngưỡng — chat sẽ trả thiếu thông tin.</p>}
        </div>
        {retrieval.queries.map((query) => <details key={query.name}><summary className="cursor-pointer">{query.name} {query.thresholded ? '' : '(không áp ngưỡng)'}</summary>
          {query.results.map((result) => <p key={result.id} className="ml-4 text-xs"><code>{result.id}</code> {result.score.toFixed(3)}</p>)}
        </details>)}
      </div>}
    </section>
  </main>;
}
