import Link from 'next/link';
import KnowledgeClient from '@/components/knowledge-client';
import { KnowledgeTabs } from '@/components/admin/knowledge-tabs';
import { EmptyState, PageHeader, td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { DatabaseIcon, PlusIcon } from '@/components/admin-ui/icons';
import { listScopes } from '@/features/knowledge/scopes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Knowledge · Admin' };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const files = (await searchParams).tab === 'files';
  const scopes = files ? [] : await listScopes();
  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge" description="Tài liệu được gom thành các scope. Mỗi scope là một tool: tên và mô tả tool giúp AI chọn đúng lúc cần tra và chỉ tìm trong các file của scope đó."
        actions={!files && <Link href="/admin/knowledge/scopes/new"><Button><PlusIcon />Thêm scope</Button></Link>} />
      <KnowledgeTabs active={files ? 'files' : 'scopes'} />
      {files ? <KnowledgeClient /> : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-gray-100 dark:border-white/5"><tr><th className={th}>Scope</th><th className={th}>Tên tool</th><th className={thEnd}>Số file</th><th className={th}>Agent đang dùng</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {scopes.length === 0 && <tr><td colSpan={4}><EmptyState icon={<DatabaseIcon />} title="Chưa có scope" hint="Tạo scope, chọn các file thuộc scope và đặt tên + mô tả tool để AI biết khi nào cần tra." /></td></tr>}
                {scopes.map((scope) => (
                  <tr key={scope.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                    <td className={td}>
                      <Link className="font-medium text-gray-800 hover:underline dark:text-white/90" href={`/admin/knowledge/scopes/${scope.id}`}>{scope.name}</Link>
                      <p className="mt-0.5 line-clamp-2 max-w-lg text-theme-xs text-gray-500 dark:text-gray-400">{scope.tool_description}</p>
                    </td>
                    <td className={td}><code className="text-xs">{scope.tool_name}</code></td>
                    <td className={`${td} text-end tabular-nums`}>{scope.document_count}</td>
                    <td className={td}>{scope.agents.length ? <span className="inline-flex flex-wrap gap-1.5">{scope.agents.map((agent) => <Badge key={agent.id} color="gray" size="sm">{agent.name}</Badge>)}</span> : <span className="text-gray-400">Chưa gán</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
