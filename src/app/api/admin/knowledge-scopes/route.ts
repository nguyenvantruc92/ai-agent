import { NextResponse } from 'next/server';
import { createScope, listScopes, scopeInput } from '@/features/knowledge/scopes';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await listScopes()); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const input = scopeInput.parse(await request.json());
    const id = await createScope(input);
    await audit('admin', 'knowledge_scope.create', 'knowledge_scope', id, { toolName: input.toolName, documents: input.documentIds.length });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
