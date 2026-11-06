import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/db/client';
import { agentMcpServerIds, agentScopes, getAgent, invalidateAgentCache, type AgentRow } from '@/features/ai/agents';
import { allowedModels } from '@/features/ai/models';
import { HttpError } from '@/lib/http';

const uuid = z.string().uuid('ID không hợp lệ.');
export const MAX_INSTRUCTIONS = 12_000;

export const agentInput = z.object({
  name: z.string().trim().min(2, 'Tên cần ít nhất 2 ký tự.').max(80, 'Tên tối đa 80 ký tự.'),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}$/, 'Mã (slug) gồm chữ thường, số, dấu gạch ngang; 2–49 ký tự.'),
  /** What the admin wants the agent to be; also the brief for "Tạo prompt bằng AI". */
  description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự.').default(''),
  /** The agent's whole system prompt (written by hand or generated). Code only adds this turn's facts after it. */
  instructions: z.string().trim().min(20, 'Prompt cần ít nhất 20 ký tự.').max(MAX_INSTRUCTIONS, `Prompt tối đa ${MAX_INSTRUCTIONS} ký tự.`),
  /** Set when the prompt was generated for the current tools (see prompt-signature.ts); null = hand-written. */
  promptToolsSignature: z.string().max(4000).nullable().default(null),
  model: z.string().trim().min(1),
  temperature: z.number().min(0, 'Temperature từ 0 đến 2.').max(2, 'Temperature từ 0 đến 2.'),
  maxTokens: z.number().int().min(1).max(32_768).default(500),
  maxSteps: z.number().int().min(1).max(20),
  maxToolCalls: z.number().int().min(1).max(20),
  isActive: z.boolean().default(true),
  /** Conversation history; null = system default (env). Same ranges as the DB check in migration 0016. */
  summaryEnabled: z.boolean().nullable().default(null),
  summarizeAfterMessages: z.number().int().min(8, 'Ngưỡng tóm tắt từ 8 đến 200 tin nhắn.').max(200, 'Ngưỡng tóm tắt từ 8 đến 200 tin nhắn.').nullable().default(null),
  keepRecentMessages: z.number().int().min(4, 'Giữ nguyên văn từ 4 đến 100 tin nhắn.').max(100, 'Giữ nguyên văn từ 4 đến 100 tin nhắn.').nullable().default(null),
  scopeIds: z.array(uuid).max(50).default([]),
  /** MCP servers the agent uses. It gets every tool ticked on each server (tools are chosen on the MCP Server page). */
  mcpServerIds: z.array(uuid).max(50).default([]),
}).refine((input) => input.summarizeAfterMessages === null || input.keepRecentMessages === null || input.summarizeAfterMessages > input.keepRecentMessages,
  { message: 'Ngưỡng tóm tắt phải lớn hơn số tin nhắn giữ nguyên văn.', path: ['summarizeAfterMessages'] });
export type AgentInput = z.infer<typeof agentInput>;

export type AgentDetail = AgentRow & { scopeIds: string[]; mcpServerIds: string[]; thread_count: number };

export async function getAgentDetail(id: string): Promise<AgentDetail | undefined> {
  const agent = await getAgent(id);
  if (!agent || agent.archived_at) return undefined;
  const [scopes, mcpServerIds, [{ count }]] = await Promise.all([
    agentScopes(id),
    agentMcpServerIds(id),
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM chat_threads WHERE agent_id = ${id}`,
  ]);
  return { ...agent, scopeIds: scopes.map((scope) => scope.id), mcpServerIds, thread_count: count };
}

/** Checks everything that depends on other tables, with errors an admin can act on. */
async function validateBindings(input: AgentInput) {
  if (!allowedModels().includes(input.model)) throw new HttpError(`Model “${input.model}” chưa được phép. Model hợp lệ: ${allowedModels().join(', ')}.`, 400);

  if (input.scopeIds.length) {
    const found = await sql<{ id: string }[]>`SELECT id FROM knowledge_scopes WHERE id = ANY(${sql.array(input.scopeIds, 2950)}::uuid[])`;
    if (found.length !== new Set(input.scopeIds).size) throw new HttpError('Có Knowledge scope không tồn tại.', 400);
  }
  for (const serverId of new Set(input.mcpServerIds)) {
    const [server] = await sql<{ name: string; enabled: boolean; selected_tools: unknown[] }[]>`SELECT name, enabled, selected_tools FROM mcp_servers WHERE id = ${serverId}`;
    if (!server) throw new HttpError('MCP server không tồn tại.', 400);
    if (!server.enabled) throw new HttpError(`MCP server “${server.name}” đang tắt.`, 400);
    if (!server.selected_tools.length) throw new HttpError(`MCP server “${server.name}” chưa chọn tool nào. Mở MCP Server, lấy danh sách tool và tick tool cần dùng.`, 400);
  }
}

async function writeBindings(tx: Pick<typeof sql, never> & typeof sql, agentId: string, input: AgentInput) {
  await tx`DELETE FROM agent_knowledge_scopes WHERE agent_id = ${agentId}`;
  await tx`DELETE FROM agent_mcp_servers WHERE agent_id = ${agentId}`;
  for (const scopeId of new Set(input.scopeIds)) await tx`INSERT INTO agent_knowledge_scopes (agent_id, scope_id) VALUES (${agentId}, ${scopeId})`;
  for (const serverId of new Set(input.mcpServerIds)) await tx`INSERT INTO agent_mcp_servers (agent_id, mcp_server_id) VALUES (${agentId}, ${serverId})`;
}

export async function createAgent(input: AgentInput) {
  await validateBindings(input);
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO ai_agents (id, name, slug, description, instructions, model, temperature, max_tokens, max_steps, max_tool_calls, summary_enabled, summarize_after_messages, keep_recent_messages, prompt_tools_signature, is_active, is_default)
      VALUES (${id}, ${input.name}, ${input.slug}, ${input.description}, ${input.instructions}, ${input.model}, ${input.temperature}, ${input.maxTokens}, ${input.maxSteps}, ${input.maxToolCalls},
        ${input.summaryEnabled}, ${input.summarizeAfterMessages}, ${input.keepRecentMessages}, ${input.promptToolsSignature}, ${input.isActive}, false)
    `;
    await writeBindings(tx as never, id, input);
  });
  invalidateAgentCache();
  return id;
}

export async function updateAgent(id: string, input: AgentInput) {
  const current = await getAgent(id);
  if (!current || current.archived_at) throw new HttpError('Không tìm thấy Agent.', 404);
  if (current.is_default && !input.isActive) throw new HttpError('Agent mặc định không tắt được. Hãy đặt Agent khác làm mặc định trước.', 409);
  await validateBindings(input);
  await sql.begin(async (tx) => {
    await tx`
      UPDATE ai_agents SET name = ${input.name}, slug = ${input.slug}, description = ${input.description}, instructions = ${input.instructions}, model = ${input.model},
        temperature = ${input.temperature}, max_tokens = ${input.maxTokens}, max_steps = ${input.maxSteps}, max_tool_calls = ${input.maxToolCalls},
        summary_enabled = ${input.summaryEnabled}, summarize_after_messages = ${input.summarizeAfterMessages}, keep_recent_messages = ${input.keepRecentMessages}, prompt_tools_signature = ${input.promptToolsSignature}, is_active = ${input.isActive}, updated_at = now()
      WHERE id = ${id}
    `;
    await writeBindings(tx as never, id, input);
  });
  invalidateAgentCache();
}

/** The default agent answers every storefront chat, so it must be active; the old default is unset in the same transaction. */
export async function setDefaultAgent(id: string) {
  const agent = await getAgent(id);
  if (!agent || agent.archived_at) throw new HttpError('Không tìm thấy Agent.', 404);
  if (!agent.is_active) throw new HttpError('Chỉ Agent đang bật mới được đặt làm mặc định.', 409);
  await sql.begin(async (tx) => {
    await tx`UPDATE ai_agents SET is_default = false, updated_at = now() WHERE is_default AND id <> ${id}`;
    await tx`UPDATE ai_agents SET is_default = true, updated_at = now() WHERE id = ${id}`;
  });
  invalidateAgentCache();
}

/**
 * The default agent cannot be removed. An agent that already has chat threads is archived (kept for history, unavailable for new
 * chats); one without threads is deleted.
 */
export async function removeAgent(id: string): Promise<'deleted' | 'archived'> {
  const agent = await getAgent(id);
  if (!agent || agent.archived_at) throw new HttpError('Không tìm thấy Agent.', 404);
  if (agent.is_default) throw new HttpError('Agent mặc định không xóa được. Hãy đặt Agent khác làm mặc định trước.', 409);
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM chat_threads WHERE agent_id = ${id}`;
  if (count > 0) {
    await sql`UPDATE ai_agents SET archived_at = now(), is_active = false, updated_at = now() WHERE id = ${id}`;
    invalidateAgentCache();
    return 'archived';
  }
  await sql`DELETE FROM ai_agents WHERE id = ${id}`;
  invalidateAgentCache();
  return 'deleted';
}
