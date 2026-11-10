import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { turnStream } from '@/app/api/chat/stream';
import { runChatTurn } from '@/features/agent/session';
import { adminCookie, isAdminSession } from '@/features/auth/session';
import { chatRequestSchema } from '@/features/chat/schema';
import { chatReceivedLog } from '@/features/chat/trace';
import { getOrCreateThread, visitorSession } from '@/features/chat/visitor';
import { env } from '@/lib/env';
import { tooManyRequests } from '@/lib/http';
import { logger } from '@/lib/logger';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';
import { safeError } from '@/lib/redact';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  let body;
  try { body = chatRequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: 'Yêu cầu chat không hợp lệ.', traceId }, { status: 400 }); }

  // Only an admin may pick the agent (the Chat thử panel); a visitor sending agentId is refused, not ignored.
  if (body.agentId && !isAdminSession((await cookies()).get(adminCookie)?.value)) return NextResponse.json({ error: 'Không được phép chọn Agent.', traceId }, { status: 403 });

  const visitor = await visitorSession();
  const limit = await takeRateLimit(`chat:${visitor.visitorId}:${clientIp(request)}`, env.CHAT_RATE_LIMIT, env.CHAT_RATE_WINDOW_SECONDS);
  if (!limit.allowed) return visitor.persist(tooManyRequests({ error: 'Bạn đã gửi quá nhiều tin nhắn.', traceId }, limit.retryAfterSeconds));

  let threadId: string;
  try { threadId = await getOrCreateThread(body.threadId, visitor.visitorId, body.agentId); }
  catch (error) {
    logger.error({ trace_id: traceId, stage: 'chat.setup_failed', error: safeError(error) });
    return visitor.persist(NextResponse.json({ error: 'Không thể bắt đầu chat.', traceId }, { status: 500 }));
  }
  // Only the message length and a thread pseudonym are logged (see chatReceivedLog).
  const received = chatReceivedLog(traceId, threadId, body.message);
  logger.info(received);

  return turnStream({
    request, visitor, traceId, threadId, startedAt, debug: Boolean(body.agentId),
    run: (onEvent) => runChatTurn({ threadId, visitorId: visitor.visitorId, message: body.message, traceId, signal: request.signal, onEvent }),
  });
}
