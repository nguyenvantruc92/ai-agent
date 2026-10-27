import { NextResponse } from 'next/server';
import { reindexDocument } from '@/features/knowledge/repository';
import { requireAdmin, jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await reindexDocument((await params).id), { status: 202 }); }
  catch (error) { return jsonError(error, 404); }
}
