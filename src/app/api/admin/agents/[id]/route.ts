import { NextResponse } from 'next/server';
import { z } from 'zod';
import { agentInput, getAgentDetail, removeAgent, updateAgent } from '@/features/ai/agent-admin';
import { audit } from '@/features/orders/repository';
import { apiError, HttpError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const agent = await getAgentDetail(idSchema.parse((await params).id));
    if (!agent) throw new HttpError('Không tìm thấy Agent.', 404);
    return NextResponse.json(agent);
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    const input = agentInput.parse(await request.json());
    await updateAgent(id, input);
    await audit('admin', 'ai_agent.update', 'ai_agent', id, { slug: input.slug, model: input.model, isActive: input.isActive, scopes: input.scopeIds.length, mcpServers: input.mcpServerIds.length });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

/** Deletes the agent, or archives it when it already has chat threads. */
export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    const outcome = await removeAgent(id);
    await audit('admin', `ai_agent.${outcome === 'deleted' ? 'delete' : 'archive'}`, 'ai_agent', id, {});
    return NextResponse.json({ outcome });
  } catch (error) { return apiError(error); }
}
