import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { testScopeRetrieval } from '@/features/knowledge/scopes';
import { friendlyError } from '@/lib/friendly-error';
import { apiError, HttpError, requireAdmin } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
const body = z.object({ message: z.string().trim().min(2, 'Nhập câu hỏi để thử.').max(500) });

/** What a question would retrieve from this scope alone (the same search the scope's tool runs). */
export async function POST(request: Request, { params }: Context) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = z.string().uuid('ID không hợp lệ.').parse((await params).id);
    const { message } = body.parse(await request.json());
    try { return NextResponse.json(await testScopeRetrieval(id, message, randomUUID())); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(friendlyError(error instanceof Error ? error.message : String(error)), 502);
    }
  } catch (error) { return apiError(error); }
}
