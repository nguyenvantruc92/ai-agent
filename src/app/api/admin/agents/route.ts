import { NextResponse } from 'next/server';
import { agentInput, createAgent } from '@/features/ai/agent-admin';
import { listAgents } from '@/features/ai/agents';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await listAgents()); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const input = agentInput.parse(await request.json());
    const id = await createAgent(input);
    await audit('admin', 'ai_agent.create', 'ai_agent', id, { slug: input.slug, model: input.model, scopes: input.scopeIds.length, mcpServers: input.mcpServerIds.length });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
