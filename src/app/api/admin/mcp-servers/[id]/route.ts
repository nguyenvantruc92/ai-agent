import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteServer, getServer, serverInput, setServerEnabled, updateServer } from '@/features/mcp/servers';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await getServer(idSchema.parse((await params).id))); } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    const input = serverInput.parse(await request.json());
    await updateServer(id, input);
    await audit('admin', 'mcp_server.update', 'mcp_server', id, { slug: input.slug, authType: input.authType, secretChanged: Boolean(input.authSecret), tools: input.selectedTools.length });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

/** Turns a server on or off. Turning one off reports the agents that were using it. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json());
    const result = await setServerEnabled(id, enabled);
    await audit('admin', enabled ? 'mcp_server.enable' : 'mcp_server.disable', 'mcp_server', id, {});
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    await deleteServer(id);
    await audit('admin', 'mcp_server.delete', 'mcp_server', id, {});
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
