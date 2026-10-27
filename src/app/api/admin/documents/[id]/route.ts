import { NextResponse } from 'next/server';
import { getDocument, softDeleteDocument } from '@/features/knowledge/repository';
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
