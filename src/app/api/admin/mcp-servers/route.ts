import { NextResponse } from 'next/server';
import { audit } from '@/features/orders/repository';
import { createServer, listServers, serverInput } from '@/features/mcp/servers';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await listServers()); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const input = serverInput.parse(await request.json());
    const id = await createServer(input);
    await audit('admin', 'mcp_server.create', 'mcp_server', id, { slug: input.slug, authType: input.authType, tools: input.selectedTools.length });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
