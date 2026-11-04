import { NextResponse } from 'next/server';
import { z } from 'zod';
import { selectedToolInput, setBuiltinSelectedTools } from '@/features/mcp/servers';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

/** Which tools of the built-in server are ticked (how each runs stays fixed in code). External servers save their tools with the server itself. */
export async function PUT(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = z.string().uuid('ID không hợp lệ.').parse((await params).id);
    const { selectedTools } = z.object({ selectedTools: z.array(selectedToolInput).max(100) }).parse(await request.json());
    await setBuiltinSelectedTools(id, selectedTools);
    await audit('admin', 'mcp_server.select_tools', 'mcp_server', id, { tools: selectedTools.length });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
