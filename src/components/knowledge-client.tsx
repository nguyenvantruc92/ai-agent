'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { EmptyState, td, th } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { DatabaseIcon, SearchIcon, UploadIcon } from '@/components/admin-ui/icons';
import { Input } from '@/components/admin-ui/input';
import { cn } from '@/lib/cn';
import { friendlyError } from '@/lib/friendly-error';

type Document = { id: string; scopes?: { id: string; name: string }[]; original_filename: string; status: string; created_at: string; version?: number; version_status?: string; safety_status?: 'pending_scan' | 'needs_review' | 'approved' | 'rejected'; active_version?: number | null; error?: string | null };
type RetrievalResult = { traceId: string; chunks: { source_id: string; title: string; similarity: number }[]; queries: { name: string; thresholded: boolean; results: { id: string; score: number }[] }[] };

export default function KnowledgeClient() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [retrieval, setRetrieval] = useState<RetrievalResult>();

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/documents');
    if (response.status === 401) { router.push('/admin/login'); return; }
    setDocuments(await response.json());
    setLoaded(true);
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
    setBusy(true);
    const body = new FormData(); body.set('file', file);
    const response = await fetch('/api/admin/documents', { method: 'POST', body });
    const data = await response.json().catch(() => ({})) as { error?: string; imported?: { products: number } };
    if (!response.ok) toast('error', data.error ?? 'Upload thất bại.');
    else toast('success', data.imported ? `Đã import ${data.imported.products} sản phẩm từ XLSX.` : 'Đã upload, đang xếp hàng index. Nhớ gán file vào một scope để AI tra cứu được.');
    await load(); setBusy(false); event.target.value = '';
  }
  async function reindex(id: string) { await fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }); toast('success', 'Đã xếp hàng index lại.'); await load(); }
  async function remove(id: string) {
    if (!(await confirm({ title: 'Xóa mềm tài liệu này?', message: 'Chatbot sẽ ngừng dùng tài liệu này.', confirmLabel: 'Xóa', danger: true }))) return;
    const response = await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
    if (!response.ok) toast('error', (await response.json().catch(() => ({}))).error ?? 'Không xóa được.');
    else toast('success', 'Đã xóa tài liệu.');
    await load();
  }
  async function testRetrieval(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    const response = await fetch('/api/admin/retrieval-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: question }) });
    if (response.ok) setRetrieval(await response.json());
    else toast('error', (await response.json()).error ?? 'Không chạy được retrieval test.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">PDF, Markdown và TXT được worker quét an toàn rồi index; chat dùng version active cho đến khi version mới được duyệt và ready. Một file chỉ được AI tra cứu khi thuộc ít nhất một scope được gán cho Agent. File XLSX sẽ import vào danh sách sản phẩm.</p>
        <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600', busy && 'pointer-events-none opacity-60')}>
          <UploadIcon className="size-5" />{busy ? 'Đang upload…' : 'Upload tài liệu'}
          <input className="sr-only" type="file" accept=".pdf,.md,.txt,.xlsx,application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={upload} />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-gray-100 dark:border-white/5"><tr><th className={th}>File</th><th className={th}>Scope</th><th className={th}>Active</th><th className={th}>Version mới nhất</th><th className={th}>Thao tác</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loaded && documents.length === 0 && <tr><td colSpan={5}><EmptyState icon={<DatabaseIcon />} title="Chưa có tài liệu" hint="Upload PDF chính sách để chatbot trả lời về giao hàng, đổi trả…" /></td></tr>}
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}><Link className="font-medium text-gray-800 hover:underline dark:text-white/90" href={`/admin/knowledge/${doc.id}`}>{doc.original_filename}</Link>{doc.error && <p className="mt-1 text-theme-xs text-red-500">{friendlyError(doc.error)}</p>}</td>
                  <td className={td}>{doc.scopes?.length ? <span className="inline-flex flex-wrap gap-1.5">{doc.scopes.map((scope) => <Link key={scope.id} href={`/admin/knowledge/scopes/${scope.id}`}><Badge color="gray" size="sm">{scope.name}</Badge></Link>)}</span> : <Badge color="warning" size="sm">Chưa thuộc scope</Badge>}</td>
                  <td className={td}>{doc.active_version ? `v${doc.active_version}` : '—'}</td>
                  <td className={td}><span className="inline-flex items-center gap-2">v{doc.version ?? 1} <StatusBadge status={doc.safety_status === 'needs_review' ? 'review' : doc.safety_status === 'rejected' ? 'rejected' : doc.version_status ?? doc.status} /></span></td>
                  <td className={td}><Button size="xs" variant="ghost" onClick={() => void reindex(doc.id)}>Re-index</Button><Button size="xs" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => void remove(doc.id)}>Xóa</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Kiểm tra retrieval</h2>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">Tìm trên toàn bộ tài liệu, không lọc theo scope. Để thử một scope, mở scope đó.</p>
        <form className="mt-4 flex gap-2" onSubmit={testRetrieval}>
          <div className="relative flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-gray-400" /><Input className="pl-11" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ví dụ: Phí giao hàng bao nhiêu?" /></div>
          <Button size="sm" type="submit">Chạy</Button>
        </form>
        {retrieval && (
          <div className="mt-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <p className="text-theme-xs text-gray-500">Trace: {retrieval.traceId}</p>
            <div>
              <p className="font-medium text-gray-800 dark:text-white/90">Context đưa vào prompt ({retrieval.chunks.length})</p>
              {retrieval.chunks.length
                ? retrieval.chunks.map((chunk) => <p key={chunk.source_id}><code className="text-xs">{chunk.source_id}</code> · {chunk.title} <span className="text-gray-500">({chunk.similarity.toFixed(3)})</span></p>)
                : <p className="text-gray-500">Không có chunk đạt ngưỡng — chat sẽ trả thiếu thông tin.</p>}
            </div>
            {retrieval.queries.map((query) => (
              <details key={query.name}><summary className="cursor-pointer">{query.name} {query.thresholded ? '' : '(không áp ngưỡng)'}</summary>
                {query.results.map((result) => <p key={result.id} className="ml-4 text-xs"><code>{result.id}</code> {result.score.toFixed(3)}</p>)}
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
