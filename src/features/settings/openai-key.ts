import { z } from 'zod';
import { sql } from '@/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { safeError } from '@/lib/redact';
import { decryptSecret, encryptSecret } from '@/lib/secrets';

/**
 * The OpenAI API key used by chat, retrieval, embeddings and the agent. Staff set it in Admin → Cài đặt; it is stored
 * encrypted in `app_secrets` and wins over OPENAI_API_KEY from `.env`, which stays as a fallback. The web, worker and
 * MCP processes each cache the resolved key briefly, so a change reaches all of them within CACHE_MS without a restart.
 */
const NAME = 'openai_api_key';
const CACHE_MS = 15_000;

export const openAiKeyInput = z.string().trim()
  .min(20, 'Khóa OpenAI quá ngắn.')
  .max(300, 'Khóa OpenAI quá dài.')
  .regex(/^sk-[A-Za-z0-9_-]+$/, 'Khóa OpenAI phải bắt đầu bằng "sk-" và không chứa khoảng trắng.');

let cache: { key: string | null; at: number } | undefined;
export const clearOpenAiKeyCache = () => { cache = undefined; };

type Stored = { value_encrypted: string; hint: string; updated_at: Date };
const readStored = async () => (await sql<Stored[]>`SELECT value_encrypted, hint, updated_at FROM app_secrets WHERE name = ${NAME}`)[0];

/** The key to use right now (admin-saved first, then `.env`), or null when none is configured. */
export async function getOpenAiKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.key;
  let key: string | null = null;
  try {
    const stored = await readStored();
    if (stored) key = decryptSecret(stored.value_encrypted);
  } catch (error) {
    logger.warn({ stage: 'openai_key.unreadable', error: safeError(error) });
  }
  key ??= env.OPENAI_API_KEY?.trim() || null;
  cache = { key, at: Date.now() };
  return key;
}

export type OpenAiKeyStatus = {
  /** Where the active key comes from. */
  source: 'admin' | 'env' | 'none';
  /** Last four characters of the active key. */
  hint: string | null;
  updatedAt: string | null;
  /** A key is stored but cannot be decrypted (the encryption secret changed). */
  unreadable: boolean;
  envFallback: boolean;
};

export async function openAiKeyStatus(): Promise<OpenAiKeyStatus> {
  const stored = await readStored();
  const envKey = env.OPENAI_API_KEY?.trim() || null;
  let unreadable = false;
  if (stored) { try { decryptSecret(stored.value_encrypted); } catch { unreadable = true; } }
  if (stored && !unreadable) return { source: 'admin', hint: stored.hint, updatedAt: new Date(stored.updated_at).toISOString(), unreadable, envFallback: Boolean(envKey) };
  if (envKey) return { source: 'env', hint: envKey.slice(-4), updatedAt: null, unreadable, envFallback: true };
  return { source: 'none', hint: null, updatedAt: null, unreadable, envFallback: false };
}

export async function saveOpenAiKey(apiKey: string) {
  await sql`
    INSERT INTO app_secrets (name, value_encrypted, hint) VALUES (${NAME}, ${encryptSecret(apiKey)}, ${apiKey.slice(-4)})
    ON CONFLICT (name) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, hint = EXCLUDED.hint, updated_at = now()
  `;
  clearOpenAiKeyCache();
}

export async function deleteOpenAiKey() {
  await sql`DELETE FROM app_secrets WHERE name = ${NAME}`;
  clearOpenAiKeyCache();
}

/** Asks OpenAI to list models: free, and enough to tell a valid key from a wrong or revoked one. */
export async function verifyOpenAiKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 401 || response.status === 403) return { ok: false, message: 'OpenAI từ chối khóa này (sai, hết hạn hoặc đã bị thu hồi).' };
    if (!response.ok && response.status !== 429) return { ok: false, message: `OpenAI trả lỗi ${response.status}. Thử lại sau.` };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Không kết nối được tới OpenAI để kiểm tra khóa. Kiểm tra mạng của máy chủ rồi thử lại.' };
  }
}
