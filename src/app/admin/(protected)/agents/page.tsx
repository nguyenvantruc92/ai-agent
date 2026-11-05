import Link from 'next/link';
import { EmptyState, PageHeader, td, th, thEnd } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { Button } from '@/components/admin-ui/button';
import { PlusIcon, SparkleIcon } from '@/components/admin-ui/icons';
import { listAgents } from '@/features/ai/agents';
import { modelLabel } from '@/features/ai/models';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Agents · Admin' };

export default async function AgentsPage() {
  const agents = await listAgents();
  return (
    <div className="space-y-6">
      <PageHeader title="AI Agents" description="Agent mặc định trả lời khách trên website. Mỗi Agent có hướng dẫn riêng, Knowledge scope và tool được bật."
        actions={<Link href="/admin/agents/new"><Button><PlusIcon />Thêm Agent</Button></Link>} />
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr><th className={th}>Agent</th><th className={th}>Model</th><th className={thEnd}>Knowledge scope</th><th className={thEnd}>MCP Server</th><th className={thEnd}>Tool</th><th className={thEnd}>Cuộc chat</th><th className={th}>Trạng thái</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {agents.length === 0 && <tr><td colSpan={7}><EmptyState icon={<SparkleIcon />} title="Chưa có Agent" /></td></tr>}
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className={td}>
                    <Link className="font-medium text-gray-800 hover:underline dark:text-white/90" href={`/admin/agents/${agent.id}`}>{agent.name}</Link>
                  </td>
                  <td className={td}>{modelLabel(agent.model)}</td>
                  <td className={`${td} text-end tabular-nums`}>{agent.scope_count}</td>
                  <td className={`${td} text-end tabular-nums`}>{agent.server_count}</td>
                  <td className={`${td} text-end tabular-nums`}>{agent.tool_count}</td>
                  <td className={`${td} text-end tabular-nums`}>{agent.thread_count}</td>
                  <td className={td}><span className="inline-flex gap-1.5">{agent.is_default && <Badge color="primary" size="sm">Mặc định</Badge>}<Badge color={agent.is_active ? 'success' : 'gray'} size="sm">{agent.is_active ? 'Đang bật' : 'Tắt'}</Badge></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
