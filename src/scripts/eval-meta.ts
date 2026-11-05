import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDefaultAgent } from '@/features/ai/agents';
import type { Baseline } from '@/scripts/eval-gate';

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

function git(command: string) {
  try { return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

/**
 * What an eval result must be traceable to: the commit, the agent that answered (model and limits now live in the
 * database, not in env) and the exact prompts. Inside the container there is no .git, so CI passes EVAL_COMMIT.
 */
export async function evalRunMetadata() {
  const agent = await getDefaultAgent();
  const core = await readFile(join(process.cwd(), 'prompts', 'fashion-tomodev-agent-core.md'), 'utf8');
  const commit = process.env.EVAL_COMMIT ?? process.env.GITHUB_SHA ?? git('rev-parse HEAD') ?? 'unknown';
  const status = process.env.EVAL_COMMIT ? '' : git('status --porcelain');
  return {
    commit,
    dirty: status === null ? null : status.length > 0,
    ranAt: new Date().toISOString(),
    agent: { id: agent.id, slug: agent.slug, model: agent.model, temperature: agent.temperature, maxSteps: agent.max_steps, maxToolCalls: agent.max_tool_calls, instructionsSha: sha(agent.instructions) },
    corePromptSha: sha(core),
  };
}

export async function loadBaseline(): Promise<Baseline> {
  return JSON.parse(await readFile(join(process.cwd(), 'evals', 'baseline.json'), 'utf8')) as Baseline;
}

export const gateRequested = () => process.argv.includes('--gate');
