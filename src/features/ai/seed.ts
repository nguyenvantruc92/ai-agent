import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { builtinToolNames } from '@/features/agent/tools';
import { defaultAgentInstructions, defaultAgentRules } from '@/features/ai/prompt';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const BUILTIN_SERVER_SLUG = 'fashion_tomodev';
export const DEFAULT_AGENT_SLUG = 'fashion-tomodev';
export const POLICY_SCOPE_TOOL = 'search_policy';
const catalogStorageKey = 'db:catalog';

/**
 * Idempotent first-run data: the built-in MCP server (its URL always follows MCP_URL) and, only when no agent exists yet,
 * the default agent with today's behaviour (the built-in MCP server, the "Chính sách" scope holding the existing policy files).
 * Later deletions are respected: nothing is recreated once the default agent exists.
 */
export async function seedAiDefaults() {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7242004)`;
    // The built-in server starts with every one of its tools ticked; later changes to the selection are kept.
    await tx`
      INSERT INTO mcp_servers (id, name, slug, url, is_builtin, enabled, selected_tools)
      VALUES (${randomUUID()}, 'Fashion Tomodev', ${BUILTIN_SERVER_SLUG}, ${env.MCP_URL}, true, true, ${tx.json(builtinToolNames.map((name) => ({ name, requiresApproval: false })) as never)})
      ON CONFLICT (is_builtin) WHERE is_builtin DO UPDATE SET url = EXCLUDED.url, updated_at = now() WHERE mcp_servers.url <> EXCLUDED.url
    `;
    const [builtin] = await tx<{ id: string }[]>`SELECT id FROM mcp_servers WHERE is_builtin`;

    // Agents from before prompts lived entirely in `instructions` relied on a rules block added in code; give it to them once.
    await tx`UPDATE ai_agents SET instructions = btrim(instructions, E'\n ') || ${`\n\n${defaultAgentRules}`}, legacy_prompt = false, updated_at = now() WHERE legacy_prompt`;

    const [{ count }] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM ai_agents`;
    if (count > 0) return;

    const agentId = randomUUID();
    await tx`
      INSERT INTO ai_agents (id, name, slug, description, instructions, model, temperature, max_tokens, max_steps, max_tool_calls, is_active, is_default)
      VALUES (${agentId}, 'Trợ lý Fashion Tomodev', ${DEFAULT_AGENT_SLUG}, 'Agent mặc định của cửa hàng: tư vấn, tra đơn, giỏ hàng, đặt hàng, đổi/trả.',
        ${defaultAgentInstructions}, ${env.OPENAI_CHAT_MODEL}, ${env.OPENAI_TEMPERATURE}, ${env.OPENAI_MAX_OUTPUT_TOKENS}, ${env.AGENT_MAX_STEPS}, ${env.AGENT_MAX_TOOL_CALLS}, true, true)
    `;
    await tx`INSERT INTO agent_mcp_servers (agent_id, mcp_server_id) VALUES (${agentId}, ${builtin.id})`;

    const scopeId = randomUUID();
    await tx`
      INSERT INTO knowledge_scopes (id, name, tool_name, tool_description, include_system_policy)
      VALUES (${scopeId}, 'Chính sách', ${POLICY_SCOPE_TOOL},
        'Tìm chính sách và FAQ của cửa hàng: đổi size, trả hàng, hoàn tiền, giao hàng, phí vận chuyển, thanh toán, bảo quản. Dùng khi khách hỏi quy định hoặc điều kiện, không dùng để tìm sản phẩm.', true)
    `;
    await tx`
      INSERT INTO knowledge_scope_documents (scope_id, document_id)
      SELECT ${scopeId}, id FROM knowledge_documents WHERE deleted_at IS NULL AND storage_key <> ${catalogStorageKey}
    `;
    await tx`INSERT INTO agent_knowledge_scopes (agent_id, scope_id) VALUES (${agentId}, ${scopeId})`;
    // Threads from before agents existed keep working with the default agent.
    await tx`UPDATE chat_threads SET agent_id = ${agentId} WHERE agent_id IS NULL`;
    logger.info({ stage: 'ai.seeded', agentId, scopeId });
  });
}

let seeded: Promise<void> | undefined;
/** Runs the seed once per process; a failure is retried on the next call. */
export function ensureAiDefaults() {
  seeded ??= seedAiDefaults().catch((error) => { seeded = undefined; throw error; });
  return seeded;
}
export const resetAiSeedCache = () => { seeded = undefined; };

/** Puts a freshly seeded policy file (e.g. the FAQ PDF created by `db:seed`) into the default "Chính sách" scope. */
export async function linkToPolicyScope(documentId: string) {
  await sql`
    INSERT INTO knowledge_scope_documents (scope_id, document_id)
    SELECT id, ${documentId} FROM knowledge_scopes WHERE tool_name = ${POLICY_SCOPE_TOOL}
    ON CONFLICT DO NOTHING
  `;
}
