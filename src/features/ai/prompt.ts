import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const textBlock = (file: string) => readFileSync(join(process.cwd(), 'prompts', file), 'utf8').match(/```text\n([\s\S]*?)\n```/)![1];

/**
 * The locked part of every agent's system prompt: order/exchange/return/shopping procedures, scope and safety rules,
 * the `final_answer` contract. Admins edit an agent's `instructions`; they cannot remove or override this block.
 */
export const agentCorePrompt = textBlock('fashion-tomodev-agent-core.md');

/** Instructions the default agent is seeded with (persona and shop description). */
export const defaultAgentInstructions = textBlock('fashion-tomodev-agent-instructions.md');

/** Final system prompt: the agent's own instructions, then the locked core. Placeholders are filled by the graph per turn. */
export const composeSystemPrompt = (instructions: string) => `${instructions.trim()}\n\n${agentCorePrompt}`;
