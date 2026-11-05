import type { StructuredToolInterface } from '@langchain/core/tools';
import { sql } from '@/db/client';
import { ensureAiDefaults } from '@/features/ai/seed';
import { buildAgentTools, builtinToolNames, externalModelName, type ExternalToolSpec, type ScopeToolSpec } from '@/features/agent/tools';
import type { SelectedTool } from '@/features/mcp/servers';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

export type AgentRow = {
  id: string; name: string; slug: string; description: string; instructions: string; model: string; temperature: number;
  max_tokens: number; max_steps: number; max_tool_calls: number;
  /** NULL = env default (see migration 0016). */
  summary_enabled: boolean | null; summarize_after_messages: number | null; keep_recent_messages: number | null;
  is_active: boolean; is_default: boolean; archived_at: string | null; created_at: string; updated_at: string;
};

type RawAgent = Omit<AgentRow, 'temperature'> & { temperature: string };
const toAgent = (row: RawAgent): AgentRow => ({ ...row, temperature: Number(row.temperature) });

export type RuntimeScope = ScopeToolSpec & { id: string; name: string };

/** Everything the graph needs to run one turn for an agent. Resolved per turn from the database (short cache). */
export type AgentRuntimeConfig = {
  agentId: string;
  agentName: string;
  instructions: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxSteps: number;
  maxToolCalls: number;
  /** Model-facing names of the built-in tools this agent may call. */
  enabledBuiltin: ReadonlySet<string>;
  scopes: RuntimeScope[];
  /** External MCP tools by the name the model sees. */
  externalTools: ReadonlyMap<string, ExternalToolSpec>;
  /** Tool schemas bound to the model (enabled built-ins + one per scope + final_answer). */
  tools: StructuredToolInterface[];
  /** Conversation-history window and summary, resolved from the agent with env defaults. */
  history: HistorySettings;
};

export type HistorySettings = { summaryEnabled: boolean; summarizeAfterMessages: number; keepRecentMessages: number };

/** Agent columns override the env defaults; NULL means "use the default". */
export const resolveHistory = (agent: Pick<AgentRow, 'summary_enabled' | 'summarize_after_messages' | 'keep_recent_messages'>): HistorySettings => ({
  summaryEnabled: agent.summary_enabled ?? env.AGENT_SUMMARY_ENABLED,
  summarizeAfterMessages: agent.summarize_after_messages ?? env.AGENT_SUMMARIZE_AFTER_MESSAGES,
  keepRecentMessages: agent.keep_recent_messages ?? env.AGENT_KEEP_RECENT_MESSAGES,
});

export async function getDefaultAgent(): Promise<AgentRow> {
  await ensureAiDefaults();
  const [row] = await sql<RawAgent[]>`SELECT * FROM ai_agents WHERE is_default AND is_active AND archived_at IS NULL`;
  if (!row) throw new HttpError('Chưa có Agent mặc định.', 500);
  return toAgent(row);
}

export async function getAgent(id: string): Promise<AgentRow | undefined> {
  const [row] = await sql<RawAgent[]>`SELECT * FROM ai_agents WHERE id = ${id}`;
  return row ? toAgent(row) : undefined;
}

export async function listAgents(): Promise<(AgentRow & { scope_count: number; server_count: number; tool_count: number; thread_count: number })[]> {
  await ensureAiDefaults();
  const rows = await sql<(RawAgent & { scope_count: number; server_count: number; tool_count: number; thread_count: number })[]>`
    SELECT a.*,
      (SELECT count(*)::int FROM agent_knowledge_scopes s WHERE s.agent_id = a.id) AS scope_count,
      (SELECT count(*)::int FROM agent_mcp_servers m WHERE m.agent_id = a.id) AS server_count,
      (SELECT coalesce(sum(jsonb_array_length(s.selected_tools)), 0)::int FROM agent_mcp_servers m JOIN mcp_servers s ON s.id = m.mcp_server_id AND s.enabled WHERE m.agent_id = a.id) AS tool_count,
      (SELECT count(*)::int FROM chat_threads c WHERE c.agent_id = a.id) AS thread_count
    FROM ai_agents a
    WHERE a.archived_at IS NULL
    ORDER BY a.is_default DESC, a.created_at
  `;
  return rows.map((row) => ({ ...toAgent(row), scope_count: row.scope_count, server_count: row.server_count, tool_count: row.tool_count, thread_count: row.thread_count }));
}

export async function agentScopes(agentId: string): Promise<(RuntimeScope & { includeSystemPolicy: boolean })[]> {
  const rows = await sql<{ id: string; name: string; tool_name: string; tool_description: string; include_system_policy: boolean }[]>`
    SELECT s.id, s.name, s.tool_name, s.tool_description, s.include_system_policy
    FROM agent_knowledge_scopes a JOIN knowledge_scopes s ON s.id = a.scope_id
    WHERE a.agent_id = ${agentId}
    ORDER BY s.name
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, toolName: row.tool_name, description: row.tool_description, includeSystemPolicy: row.include_system_policy }));
}

/** MCP servers an agent uses (the agent gets every tool ticked on each of them). */
export async function agentMcpServerIds(agentId: string): Promise<string[]> {
  const rows = await sql<{ mcp_server_id: string }[]>`SELECT mcp_server_id FROM agent_mcp_servers WHERE agent_id = ${agentId}`;
  return rows.map((row) => row.mcp_server_id);
}

/** The agent a chat thread belongs to; threads without one (or whose agent was archived) use the default agent. */
export async function agentForThread(threadId: string): Promise<AgentRow> {
  await ensureAiDefaults();
  const [row] = await sql<RawAgent[]>`
    SELECT a.* FROM chat_threads t JOIN ai_agents a ON a.id = t.agent_id
    WHERE t.id = ${threadId} AND a.archived_at IS NULL
  `;
  return row ? toAgent(row) : getDefaultAgent();
}

const CACHE_MS = 5_000;
const cache = new Map<string, { at: number; config: AgentRuntimeConfig }>();
/** Call after changing an agent, scope or tool binding so this process sees it immediately (others catch up within CACHE_MS). */
export const invalidateAgentCache = () => cache.clear();

type ServerToolsRow = { id: string; name: string; slug: string; is_builtin: boolean; selected_tools: SelectedTool[]; tools_cache: { name: string; description?: string; inputSchema?: unknown }[] };

/**
 * The tools an agent gets from its MCP servers: every ticked tool of each enabled server. For the built-in server these are
 * model-facing built-in tool names (their confirmation/approval rules are fixed in code); for external servers, tools the server still
 * lists, with the "needs staff approval" flag set on the server.
 */
export async function agentServerTools(agentId: string): Promise<{ builtin: string[]; externals: ExternalToolSpec[] }> {
  const rows = await sql<ServerToolsRow[]>`
    SELECT s.id, s.name, s.slug, s.is_builtin, s.selected_tools, s.tools_cache
    FROM agent_mcp_servers m JOIN mcp_servers s ON s.id = m.mcp_server_id
    WHERE m.agent_id = ${agentId} AND s.enabled
    ORDER BY s.is_builtin DESC, s.slug
  `;
  const known: readonly string[] = builtinToolNames;
  const taken = new Set<string>();
  const builtin: string[] = [];
  const externals: ExternalToolSpec[] = [];
  for (const row of rows) {
    for (const selected of row.selected_tools) {
      if (row.is_builtin) { if (known.includes(selected.name)) builtin.push(selected.name); continue; }
      const listed = row.tools_cache.find((item) => item.name === selected.name);
      if (!listed) continue;
      const modelName = externalModelName(row.slug, selected.name, taken);
      taken.add(modelName);
      const schema = listed.inputSchema && typeof listed.inputSchema === 'object' ? listed.inputSchema as Record<string, unknown> : {};
      externals.push({ modelName, serverId: row.id, serverName: row.name, serverSlug: row.slug, toolName: selected.name, description: listed.description ?? '', inputSchema: 'omitted' in schema ? {} : schema, requiresApproval: selected.requiresApproval });
    }
  }
  return { builtin, externals };
}

async function buildRuntime(agent: AgentRow): Promise<AgentRuntimeConfig> {
  const [scopes, { builtin, externals }] = await Promise.all([agentScopes(agent.id), agentServerTools(agent.id)]);
  const enabledBuiltin = new Set(builtin);
  return {
    agentId: agent.id, agentName: agent.name, instructions: agent.instructions, model: agent.model, temperature: agent.temperature,
    maxTokens: agent.max_tokens, maxSteps: agent.max_steps, maxToolCalls: agent.max_tool_calls, enabledBuiltin, scopes,
    externalTools: new Map(externals.map((spec) => [spec.modelName, spec])),
    tools: buildAgentTools(enabledBuiltin, scopes, externals),
    history: resolveHistory(agent),
  };
}
export async function loadAgentRuntime(threadId: string): Promise<AgentRuntimeConfig> {
  const agent = await agentForThread(threadId);
  const hit = cache.get(agent.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.config;
  const config = await buildRuntime(agent);
  cache.set(agent.id, { at: Date.now(), config });
  return config;
}
