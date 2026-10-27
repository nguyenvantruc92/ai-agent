import { createHmac } from 'node:crypto';
import { Output } from 'ai';
import { chatAnswerSchema } from '@/features/chat/schema';
import { env } from '@/lib/env';
import { openai } from '@/lib/openai';

/** OpenAI only ever sees an HMAC of the visitor id, never the id itself. */
export function hashVisitorId(visitorId: string) {
  return createHmac('sha256', env.ADMIN_SESSION_SECRET ?? 'fashion-tomodev-local').update(`openai-user:${visitorId}`).digest('hex');
}

/**
 * Shared by webchat (streamText) and evals (generateText) so the golden set
 * measures the production configuration. The Responses API does not accept
 * frequency/presence penalties, so they stay at OpenAI's default of 0.
 */
export function generationSettings(visitorHash: string) {
  return {
    model: openai.responses(env.OPENAI_CHAT_MODEL),
    temperature: env.OPENAI_TEMPERATURE,
    maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    maxRetries: env.OPENAI_MAX_RETRIES,
    experimental_output: Output.object({ schema: chatAnswerSchema }),
    providerOptions: {
      openai: {
        store: false,
        strictJsonSchema: true,
        parallelToolCalls: false,
        serviceTier: 'default' as const,
        user: visitorHash,
      },
    },
  };
}
