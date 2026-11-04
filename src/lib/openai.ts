import { createOpenAI } from '@ai-sdk/openai';
import { getOpenAiKey } from '@/features/settings/openai-key';

/**
 * The key is resolved on every request (Admin → Cài đặt, falling back to `.env`), so changing it takes effect without
 * a restart. The SDK needs some apiKey at construction; the real one is put on the request by `fetch`.
 */
export const openai = createOpenAI({
  apiKey: 'managed-in-admin-settings',
  fetch: async (input, init) => {
    const key = await getOpenAiKey();
    if (!key) throw new Error('Chưa cấu hình OpenAI API key (Admin → Cài đặt).');
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${key}`);
    return fetch(input, { ...init, headers });
  },
});
