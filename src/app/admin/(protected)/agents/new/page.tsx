import Link from 'next/link';
import { AgentForm } from '@/components/admin/agent-form';
import { PageHeader } from '@/components/admin/page-header';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';
import { agentFormOptions } from '@/features/ai/agent-form-data';
import { agentMcpServerIds, agentScopes, getDefaultAgent } from '@/features/ai/agents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Thêm Agent · Admin' };

/** A new agent starts as a copy of the default agent's instructions, model, limits, scopes and MCP servers. */
export default async function NewAgentPage() {
  const [options, base] = await Promise.all([agentFormOptions(), getDefaultAgent()]);
  const [scopes, mcpServerIds] = await Promise.all([agentScopes(base.id), agentMcpServerIds(base.id)]);
  return (
    <div className="space-y-6">
      <Link href="/admin/agents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />AI Agents</Link>
      <PageHeader title="Thêm Agent" description={`Bắt đầu từ cấu hình của “${base.name}”; chỉnh lại những gì khác.`} />
      <AgentForm {...options} initial={{
        name: '', slug: '', description: '', instructions: base.instructions, model: base.model, temperature: base.temperature, maxTokens: base.max_tokens, maxSteps: base.max_steps, maxToolCalls: base.max_tool_calls,
        summaryEnabled: base.summary_enabled, summarizeAfterMessages: base.summarize_after_messages, keepRecentMessages: base.keep_recent_messages, promptToolsSignature: base.prompt_tools_signature,
        isActive: true, isDefault: false, scopeIds: scopes.map((scope) => scope.id), mcpServerIds, threadCount: 0,
      }} />
    </div>
  );
}
