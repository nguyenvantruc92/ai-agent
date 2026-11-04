import { env } from '@/lib/env';

/** Chat models an agent may use: OPENAI_CHAT_MODEL plus OPENAI_ALLOWED_MODELS. */
export function allowedModels() {
  const extra = env.OPENAI_ALLOWED_MODELS.split(',').map((item) => item.trim()).filter(Boolean);
  return [...new Set([env.OPENAI_CHAT_MODEL, ...extra])];
}
