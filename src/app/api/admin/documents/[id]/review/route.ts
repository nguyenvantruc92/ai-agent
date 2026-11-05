import { NextResponse } from 'next/server';
import { decideSafetyReview } from '@/features/knowledge/repository';
import { requireAdmin, jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await request.json() as { versionId?: string; decision?: 'approved' | 'rejected' };
    if (!body.versionId || (body.decision !== 'approved' && body.decision !== 'rejected')) throw new Error('Quyết định duyệt không hợp lệ.');
    return NextResponse.json(await decideSafetyReview((await params).id, body.versionId, body.decision));
  } catch (error) { return jsonError(error); }
}
