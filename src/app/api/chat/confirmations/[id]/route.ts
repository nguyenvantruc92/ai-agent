import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { turnStream } from '@/app/api/chat/stream';
import { getConfirmation } from '@/features/agent/confirmations';
import { ConfirmationConflictError, recordConfirmationDecision, resumeConfirmation } from '@/features/agent/session';
import { ownedThread, visitorSession } from '@/features/chat/visitor';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { takeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.object({ decision: z.enum(['confirm', 'cancel']) });

/**
 * The Xác nhận / Huỷ buttons of the chat widget. This is the ONLY place a customer confirmation can be recorded, and it
 * requires the visitor cookie that owns the thread: the model has no way to confirm on the customer's behalf.
 */
export async function POST(request: Request, { params }: Context) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Yêu cầu không hợp lệ.', traceId }, { status: 400 });

  const visitor = await visitorSession();
  const confirmation = await getConfirmation((await params).id).catch(() => undefined);
  const threadId = confirmation ? await ownedThread(confirmation.thread_id, visitor.visitorId) : undefined;
  if (!confirmation || !threadId) return visitor.persist(NextResponse.json({ error: 'Không tìm thấy thao tác cần xác nhận.', traceId }, { status: 404 }));

  const limit = takeRateLimit(`confirm:${visitor.visitorId}`, env.CHAT_RATE_LIMIT, env.CHAT_RATE_WINDOW_SECONDS);
  if (!limit.allowed) return visitor.persist(NextResponse.json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.', traceId }, { status: 429 }));

  logger.info({ trace_id: traceId, stage: 'chat.confirmation', confirmationId: confirmation.id, decision: parsed.data.decision });
  let prepared;
  try { prepared = await recordConfirmationDecision({ confirmationId: confirmation.id, threadId, decision: parsed.data.decision === 'confirm' ? 'confirmed' : 'cancelled' }); }
  catch (error) {
    if (error instanceof ConfirmationConflictError) return visitor.persist(NextResponse.json({ error: error.message, traceId }, { status: 409 }));
    throw error;
  }
  return turnStream({
    request, visitor, traceId, threadId, startedAt,
    run: async (onEvent) => {
      const outcome = await resumeConfirmation(prepared, traceId, request.signal, onEvent);
      return outcome.resumed ? outcome.result : { resumed: false as const };
    },
  });
}
