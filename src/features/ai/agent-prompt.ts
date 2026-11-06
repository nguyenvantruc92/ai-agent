import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { sql } from '@/db/client';
import { builtinToolCatalog } from '@/features/agent/tools';
import { MAX_INSTRUCTIONS } from '@/features/ai/agent-admin';
import { serverToolsForIds } from '@/features/ai/agents';
import { allowedModels } from '@/features/ai/models';
import { generateAgentPrompt, type Complete, type PromptBrief } from '@/features/ai/prompt-generator';
import { promptToolsSignature } from '@/features/ai/prompt-signature';
import { getOpenAiKey } from '@/features/settings/openai-key';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { logger } from '@/lib/logger';
import { takeRateLimit } from '@/lib/rate-limit';
import { safeError } from '@/lib/redact';

/** What the agent form sends: the current (maybe unsaved) selection of tools and scopes, not the saved agent. */
export const generatePromptInput = z.object({
  name: z.string().trim().max(80).default(''),
  description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự.').default(''),
  model: z.string().trim().min(1),
  scopeIds: z.array(z.string().uuid()).max(50).default([]),
  mcpServerIds: z.array(z.string().uuid()).max(50).default([]),
  currentInstructions: z.string().max(MAX_INSTRUCTIONS).default(''),
});
export type GeneratePromptInput = z.infer<typeof generatePromptInput>;

const GENERATION_TIMEOUT_MS = 60_000;
const GENERATIONS_PER_WINDOW = 20;
const WINDOW_SECONDS = 10 * 60;

/** The agent as the writer should see it, plus the signature the prompt will be stored with. */
export async function briefForSelection(input: GeneratePromptInput): Promise<{ brief: PromptBrief; signature: string }> {
  const scopes = input.scopeIds.length
    ? await sql<{ name: string; tool_name: string; tool_description: string }[]>`SELECT name, tool_name, tool_description FROM knowledge_scopes WHERE id = ANY(${sql.array(input.scopeIds, 2950)}::uuid[]) ORDER BY name`
    : [];
  if (scopes.length !== new Set(input.scopeIds).size) throw new HttpError('Có Knowledge scope không tồn tại.', 400);
  const { builtin, externals } = await serverToolsForIds([...new Set(input.mcpServerIds)]);
  const brief: PromptBrief = {
    agentName: input.name || 'Agent',
    purpose: input.description,
    builtin: builtinToolCatalog(builtin),
    scopes: scopes.map((scope) => ({ name: scope.name, toolName: scope.tool_name, description: scope.tool_description })),
    externals: externals.map((tool) => ({ name: tool.modelName, serverName: tool.serverName, description: tool.description, requiresApproval: tool.requiresApproval })),
    currentInstructions: input.currentInstructions,
  };
  const signature = promptToolsSignature({
    builtin, scopes: scopes.map((scope) => scope.tool_name),
    externals: externals.map((tool) => ({ serverSlug: tool.serverSlug, toolName: tool.toolName, requiresApproval: tool.requiresApproval })),
  });
  return { brief, signature };
}

/** One completion with the key and the model chosen in the admin settings / agent form. */
export const openAiComplete = (model: string): Complete => async (system, user) => {
  const apiKey = await getOpenAiKey();
  if (!apiKey) throw new HttpError('Chưa cấu hình OpenAI API key (Admin → Cài đặt).', 409);
  const chat = new ChatOpenAI({
    apiKey, model, temperature: 0.4, maxTokens: 6_000, timeout: Math.max(env.OPENAI_TIMEOUT_MS, GENERATION_TIMEOUT_MS), maxRetries: env.OPENAI_MAX_RETRIES,
    useResponsesApi: true, zdrEnabled: true,
  });
  const reply = await chat.invoke([new SystemMessage(system), new HumanMessage(user)]);
  return typeof reply.content === 'string' ? reply.content : reply.content.map((block) => block.type === 'text' && 'text' in block ? String(block.text) : '').join('');
};

/** Writes a prompt for the agent described by the form. Nothing is saved: the admin reads and edits it first. */
export async function generateInstructions(input: GeneratePromptInput, complete: Complete = openAiComplete(input.model)) {
  if (!allowedModels().includes(input.model)) throw new HttpError(`Model “${input.model}” chưa được phép. Model hợp lệ: ${allowedModels().join(', ')}.`, 400);
  if (!(await takeRateLimit('agent-prompt:admin', GENERATIONS_PER_WINDOW, WINDOW_SECONDS)).allowed) throw new HttpError('Tạo prompt quá nhiều lần. Vui lòng thử lại sau vài phút.', 429);
  const { brief, signature } = await briefForSelection(input);
  const startedAt = Date.now();
  try {
    const instructions = await generateAgentPrompt(complete, brief);
    logger.info({ stage: 'agent_prompt.generated', model: input.model, tools: brief.builtin.length + brief.externals.length, scopes: brief.scopes.length, chars: instructions.length, latencyMs: Date.now() - startedAt });
    return { instructions, signature };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.warn({ stage: 'agent_prompt.failed', model: input.model, latencyMs: Date.now() - startedAt, error: safeError(error) });
    throw new HttpError('Không tạo được prompt: dịch vụ AI không phản hồi. Vui lòng thử lại.', 502);
  }
}
