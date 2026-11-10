import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { testScopeRetrieval } from '@/features/knowledge/scopes';
import { retrieve } from '@/features/rag/retrieval';
import { requireAdmin, jsonError } from '@/lib/http';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { message, scopeId } = await request.json() as { message?: string; scopeId?: string };
    if (!message?.trim()) throw new Error('Cần nhập câu hỏi để kiểm tra retrieval.');
    const traceId = randomUUID();
    return NextResponse.json(scopeId ? await testScopeRetrieval(scopeId, message, traceId) : await retrieve({ query: message, message, traceId }));
  } catch (error) { return jsonError(error); }
}
