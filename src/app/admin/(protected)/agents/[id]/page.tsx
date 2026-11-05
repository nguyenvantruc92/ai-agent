import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AgentForm } from '@/components/admin/agent-form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/admin-ui/badge';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';
import { getAgentDetail } from '@/features/ai/agent-admin';
import { agentFormOptions } from '@/features/ai/agent-form-data';
import { ensureAiDefaults } from '@/features/ai/seed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Agent · Admin' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureAiDefaults();
  const agent = uuid.test(id) ? await getAgentDetail(id) : undefined;
  if (!agent) notFound();
  const options = await agentFormOptions();
  return (
    <div className="space-y-6">
      <Link href="/admin/agents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />AI Agents</Link>
      <PageHeader title={agent.name}
        actions={<>{agent.is_default && <Badge color="primary">Mặc định</Badge>}<Badge color={agent.is_active ? 'success' : 'gray'}>{agent.is_active ? 'Đang bật' : 'Tắt'}</Badge></>} />
      <AgentForm key={agent.updated_at} {...options} initial={{
        id: agent.id, name: agent.name, slug: agent.slug, instructions: agent.instructions, model: agent.model, temperature: agent.temperature, maxTokens: agent.max_tokens,
        maxSteps: agent.max_steps, maxToolCalls: agent.max_tool_calls,
        summaryEnabled: agent.summary_enabled, summarizeAfterMessages: agent.summarize_after_messages, keepRecentMessages: agent.keep_recent_messages, isActive: agent.is_active, isDefault: agent.is_default, scopeIds: agent.scopeIds, mcpServerIds: agent.mcpServerIds, threadCount: agent.thread_count,
      }} />
    </div>
  );
}
