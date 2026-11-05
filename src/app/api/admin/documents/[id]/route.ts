import { NextResponse } from 'next/server';
import { getDocument, softDeleteDocument, updateDocumentMetadata } from '@/features/knowledge/repository';
import { moveToTrash } from '@/features/knowledge/files';
import { requireAdmin, jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const document = await getDocument((await params).id);
  return document ? NextResponse.json(document) : NextResponse.json({ error: 'Không tìm thấy tài liệu.' }, { status: 404 });
}

export async function DELETE(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const document = await softDeleteDocument((await params).id);
    await moveToTrash(document.storage_key).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error, 404); }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await request.json() as { contentKind?: 'general' | 'policy'; policyKey?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null; supersedesDocumentId?: string | null };
    if (body.contentKind !== 'general' && body.contentKind !== 'policy') throw new Error('Loại tài liệu không hợp lệ.');
    await updateDocumentMetadata((await params).id, {
      contentKind: body.contentKind,
      policyKey: body.policyKey ?? null,
      effectiveFrom: body.effectiveFrom ?? null,
      effectiveTo: body.effectiveTo ?? null,
      supersedesDocumentId: body.supersedesDocumentId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
