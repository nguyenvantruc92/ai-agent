import Link from 'next/link';
import { notFound } from 'next/navigation';
import DocumentActions from '@/components/document-actions';
import { StatusBadge } from '@/components/status-badge';
import { getDocument, listChunks, listJobs, listVersions } from '@/features/knowledge/repository';
import { estimateTokens } from '@/lib/tokens';

const time = (value: string | Date | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default async function KnowledgeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const document = await getDocument(id);
  if (!document || document.deleted_at) notFound();
  const [versions, jobs, chunks] = await Promise.all([
    listVersions(id),
    listJobs(id),
    document.active_version_id ? listChunks(document.active_version_id) : Promise.resolve([]),
  ]);

  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <Link className="text-sm underline" href="/admin/knowledge">← Knowledge</Link>
    <section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{document.original_filename}</h1>
          <p className="mt-1 text-sm text-stone-600">{document.mime_type} · upload {time(document.created_at)}</p>
          <p className="mt-2 text-sm">Đang phục vụ chat: <strong>{document.active_version ? `v${document.active_version}` : 'chưa có version ready'}</strong> · Version mới nhất: v{document.version} <StatusBadge status={document.version_status ?? document.status} /></p>
          {document.error && <p className="mt-2 text-sm text-red-700">Lỗi version mới nhất: {document.error}</p>}
        </div>
        <DocumentActions id={id} />
      </div>
    </section>

    <section className="rounded-xl border bg-white">
      <h2 className="border-b p-4 font-semibold">Versions</h2>
      <table className="w-full text-left text-sm">
        <thead className="bg-stone-50"><tr><th className="p-3">Version</th><th className="p-3">Trạng thái</th><th className="p-3">Chunks</th><th className="p-3">Tạo lúc</th><th className="p-3">Ready lúc</th></tr></thead>
        <tbody>{versions.map((version) => <tr key={version.id} className="border-t">
          <td className="p-3">v{version.version}{version.id === document.active_version_id && <span className="ml-2 text-xs text-emerald-700">active</span>}</td>
          <td className="p-3"><StatusBadge status={version.status} />{version.error && <p className="mt-1 text-xs text-red-700">{version.error}</p>}</td>
          <td className="p-3">{version.chunk_count}</td>
          <td className="p-3">{time(version.created_at)}</td>
          <td className="p-3">{time(version.ready_at)}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="rounded-xl border bg-white">
      <h2 className="border-b p-4 font-semibold">Ingestion jobs</h2>
      <table className="w-full text-left text-sm">
        <thead className="bg-stone-50"><tr><th className="p-3">Version</th><th className="p-3">Trạng thái</th><th className="p-3">Lần thử</th><th className="p-3">Bắt đầu</th><th className="p-3">Kết thúc</th></tr></thead>
        <tbody>{jobs.map((job) => <tr key={job.id} className="border-t">
          <td className="p-3">v{job.version}</td>
          <td className="p-3"><StatusBadge status={job.status} />{job.error && <p className="mt-1 text-xs text-red-700">{job.error}</p>}</td>
          <td className="p-3">{job.attempts}</td>
          <td className="p-3">{time(job.started_at)}</td>
          <td className="p-3">{time(job.finished_at)}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="rounded-xl border bg-white">
      <h2 className="border-b p-4 font-semibold">Chunks của version active ({chunks.length})</h2>
      <div className="divide-y">{chunks.map((chunk) => <details key={chunk.source_id} className="p-4">
        <summary className="cursor-pointer text-sm"><code className="text-xs text-stone-500">{chunk.source_id}</code> · {chunk.title} <span className="text-xs text-stone-400">~{estimateTokens(chunk.content)} tokens{chunk.metadata.page ? ` · trang ${String(chunk.metadata.page)}` : ''}</span></summary>
        <pre className="mt-3 whitespace-pre-wrap rounded bg-stone-50 p-3 text-xs leading-5">{chunk.content}</pre>
      </details>)}</div>
    </section>
  </main>;
}
