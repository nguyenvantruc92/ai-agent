import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { retrieve } from '@/features/rag/retrieval';
import { requireAdmin, jsonError } from '@/lib/http';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { message } = await request.json() as { message?: string };
    if (!message?.trim()) throw new Error('Cần nhập câu hỏi để kiểm tra retrieval.');
    return NextResponse.json(await retrieve({ query: message, message, traceId: randomUUID() }));
  } catch (error) { return jsonError(error); }
}
