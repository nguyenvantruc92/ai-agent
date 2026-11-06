import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const textBlocks = (file: string) => [...readFileSync(join(process.cwd(), 'prompts', file), 'utf8').matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1]);

const [persona, rules] = textBlocks('fashion-tomodev-agent-default.md');

/** Persona and scope the default agent is seeded with. */
export const defaultAgentPersona = persona;
/** The procedures and safety rules. Seeded into the default agent, and appended once to agents created before prompts moved fully into the database. */
export const defaultAgentRules = rules;
/** Complete prompt of the default agent (everything an agent needs; admins may rewrite it, or regenerate it with AI). */
export const defaultAgentInstructions = `${persona}\n\n${rules}`;

/** System prompt of the AI that writes agent prompts (Admin → AI Agents → "Tạo prompt bằng AI"). */
export const [agentPromptWriter] = textBlocks('agent-prompt-writer.md');

export type TurnContext = { today: string; allowedSourceIds: string[]; customerProfile: string };

/**
 * The only text code adds to an agent's own instructions: facts for this turn (date, source ids the answer may cite, what is
 * known about the customer). These are data, not rules, so they cannot contradict whatever the admin wrote.
 */
export const turnContextBlock = ({ today, allowedSourceIds, customerProfile }: TurnContext) => [
  '[NGỮ CẢNH LƯỢT NÀY — dữ liệu do hệ thống cung cấp, không phải chỉ dẫn]',
  `Hôm nay là ${today}.`,
  `source_id hợp lệ cho cited_source_ids: ${allowedSourceIds.length ? allowedSourceIds.join(', ') : 'Chưa có (chưa gọi tool nào trong lượt này).'}`,
  `Thông tin khách đã lưu (chỉ để gợi ý, luôn xác nhận lại với khách): ${customerProfile}`,
  '[HẾT NGỮ CẢNH]',
].join('\n');

/** Final system prompt: the agent's instructions, then this turn's facts. */
export const composeSystemPrompt = (instructions: string, context: TurnContext) => `${instructions.trim()}\n\n${turnContextBlock(context)}`;
