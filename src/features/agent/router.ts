import { isPromptInjection } from '@/features/chat/guardrails';
import { smallTalkAnswer } from '@/features/chat/small-talk';

export type Route = 'agent' | 'guard' | 'small_talk';

/**
 * The only checks made before the agent model runs, and neither calls a model: a prompt-injection attempt is refused,
 * and a plain greeting gets a fixed reply. Everything else goes to the agent, which decides from the tools'
 * names and descriptions which knowledge scope, product search or other tool to use.
 */
export function precheckRoute(message: string): Route {
  if (isPromptInjection(message)) return 'guard';
  if (smallTalkAnswer(message)) return 'small_talk';
  return 'agent';
}
