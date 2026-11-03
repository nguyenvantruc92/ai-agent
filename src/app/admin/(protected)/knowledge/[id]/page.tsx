import Link from 'next/link';
import { notFound } from 'next/navigation';
import DocumentActions from '@/components/document-actions';
import { th, td } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getDocument, listChunks, listJobs, listVersions } from '@/features/knowledge/repository';
import { friendlyError } from '@/lib/friendly-error';
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

  const section = 'overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3';
  const heading = 'border-b border-gray-100 px-5 py-4 text-lg font-semibold text-gray-800 sm:px-6 dark:border-white/5 dark:text-white/90';
  const head = 'border-b border-gray-100 dark:border-white/5';
  const body = 'divide-y divide-gray-100 dark:divide-white/5';

  return (
    <div className="space-y-6">
      <Link className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white" href="/admin/knowledge">← Knowledge</Link>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-title-sm font-semibold text-gray-800 sm:text-title-lg dark:text-white/90">{document.original_filename}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{document.mime_type} · upload {time(document.created_at)}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">Đang phục vụ chat: <strong>{document.active_version ? `v${document.active_version}` : 'chưa có version ready'}</strong> · Version mới nhất: v{document.version} <StatusBadge status={document.version_status ?? document.status} /></p>
            {document.error && <p className="mt-2 text-sm text-red-500">Lỗi version mới nhất: {friendlyError(document.error)}</p>}
          </div>
          <DocumentActions id={id} />
        </div>
      </section>

      <section className={section}>
        <h2 className={heading}>Versions</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead className={head}><tr><th className={th}>Version</th><th className={th}>Trạng thái</th><th className={th}>Chunks</th><th className={th}>Tạo lúc</th><th className={th}>Ready lúc</th></tr></thead>
          <tbody className={body}>{versions.map((version) => <tr key={version.id}>
            <td className={td}>v{version.version}{version.id === document.active_version_id && <span className="ml-2 text-theme-xs font-medium text-green-600">active</span>}</td>
            <td className={td}><StatusBadge status={version.status} />{version.error && <p className="mt-1 text-theme-xs text-red-500">{friendlyError(version.error)}</p>}</td>
            <td className={td}>{version.chunk_count}</td>
            <td className={td}>{time(version.created_at)}</td>
            <td className={td}>{time(version.ready_at)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className={section}>
        <h2 className={heading}>Ingestion jobs</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead className={head}><tr><th className={th}>Version</th><th className={th}>Trạng thái</th><th className={th}>Lần thử</th><th className={th}>Bắt đầu</th><th className={th}>Kết thúc</th></tr></thead>
          <tbody className={body}>{jobs.map((job) => <tr key={job.id}>
            <td className={td}>v{job.version}</td>
            <td className={td}><StatusBadge status={job.status} />{job.error && <p className="mt-1 text-theme-xs text-red-500">{friendlyError(job.error)}</p>}</td>
            <td className={td}>{job.attempts}</td>
            <td className={td}>{time(job.started_at)}</td>
            <td className={td}>{time(job.finished_at)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className={section}>
        <h2 className={heading}>Chunks của version active ({chunks.length})</h2>
        <div className={body}>{chunks.map((chunk) => (
          <details key={chunk.source_id} className="px-5 py-4 sm:px-6">
            <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300"><code className="text-xs text-gray-500">{chunk.source_id}</code> · {chunk.title} <span className="text-xs text-gray-400">~{estimateTokens(chunk.content)} tokens{chunk.metadata.page ? ` · trang ${String(chunk.metadata.page)}` : ''}</span></summary>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-700 dark:bg-white/3 dark:text-gray-300">{chunk.content}</pre>
          </details>
        ))}</div>
      </section>
    </div>
  );
}
