import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncCatalog } from '@/features/catalog/sync';
import { audit } from '@/features/orders/repository';
import { deleteOpenAiKey, getOpenAiKey, openAiKeyInput, openAiKeyStatus, saveOpenAiKey, verifyOpenAiKey } from '@/features/settings/openai-key';
import { apiError, HttpError, requireAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ apiKey: openAiKeyInput });

// The key itself is never returned: only where the active key comes from and its last four characters.

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await openAiKeyStatus()); } catch (error) { return apiError(error); }
}

/** Saves a new key after OpenAI accepts it, then re-queues the catalog index (earlier attempts failed without a key). */
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { apiKey } = body.parse(await request.json());
    const check = await verifyOpenAiKey(apiKey);
    if (!check.ok) throw new HttpError(check.message, 422);
    await saveOpenAiKey(apiKey);
    await audit('admin', 'openai_key.update', 'settings', 'openai_api_key', { hint: apiKey.slice(-4) });
    await syncCatalog();
    return NextResponse.json(await openAiKeyStatus());
  } catch (error) { return apiError(error); }
}

/** Tests a key without saving it: the one in the body, or else the key currently in use. */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const raw = await request.json().catch(() => ({})) as { apiKey?: unknown };
    const key = raw.apiKey ? body.parse(raw).apiKey : await getOpenAiKey();
    if (!key) throw new HttpError('Chưa có khóa OpenAI nào để kiểm tra.', 400);
    const check = await verifyOpenAiKey(key);
    if (!check.ok) throw new HttpError(check.message, 422);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

/** Removes the saved key; the `.env` key (if any) is used again. */
export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    await deleteOpenAiKey();
    await audit('admin', 'openai_key.delete', 'settings', 'openai_api_key', {});
    return NextResponse.json(await openAiKeyStatus());
  } catch (error) { return apiError(error); }
}
