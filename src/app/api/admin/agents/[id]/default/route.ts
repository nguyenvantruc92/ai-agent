import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setDefaultAgent } from '@/features/ai/agent-admin';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

/** Makes this agent the one that answers storefront chats. */
export async function POST(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = z.string().uuid('ID không hợp lệ.').parse((await params).id);
    await setDefaultAgent(id);
    await audit('admin', 'ai_agent.set_default', 'ai_agent', id, {});
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
