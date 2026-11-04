import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteScope, getScope, scopeInput, updateScope } from '@/features/knowledge/scopes';
import { audit } from '@/features/orders/repository';
import { apiError, HttpError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid('ID không hợp lệ.');

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const scope = await getScope(idSchema.parse((await params).id));
    if (!scope) throw new HttpError('Không tìm thấy scope.', 404);
    return NextResponse.json(scope);
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    const input = scopeInput.parse(await request.json());
    await updateScope(id, input);
    await audit('admin', 'knowledge_scope.update', 'knowledge_scope', id, { toolName: input.toolName, documents: input.documentIds.length });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = idSchema.parse((await params).id);
    await deleteScope(id);
    await audit('admin', 'knowledge_scope.delete', 'knowledge_scope', id, {});
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
