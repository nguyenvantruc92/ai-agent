import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { turnStream } from '@/app/api/chat/stream';
import { runChatTurn } from '@/features/agent/session';
import { chatRequestSchema } from '@/features/chat/schema';
import { getOrCreateThread, visitorSession } from '@/features/chat/visitor';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const encoder = new TextEncoder();

function redactForTrace(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{9,}\b/g, '[number]');
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  let body;
  try { body = chatRequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: 'Yêu cầu chat không hợp lệ.', traceId }, { status: 400 }); }

  const visitor = await visitorSession();
  const limit = takeRateLimit(`chat:${visitor.visitorId}:${clientIp(request)}`, env.CHAT_RATE_LIMIT, env.CHAT_RATE_WINDOW_SECONDS);
  if (!limit.allowed) return visitor.persist(NextResponse.json({ error: 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau.', retryAfterSeconds: limit.retryAfterSeconds, traceId }, { status: 429 }));

  let threadId: string;
  try { threadId = await getOrCreateThread(body.threadId, visitor.visitorId); }
  catch (error) {
    logger.error({ trace_id: traceId, stage: 'chat.setup_failed', error: error instanceof Error ? error.message : String(error) });
    return visitor.persist(NextResponse.json({ error: 'Không thể bắt đầu chat.', traceId }, { status: 500 }));
  }
  logger.info({ trace_id: traceId, stage: 'chat.received', threadId, question: redactForTrace(body.message) });

  return turnStream({
    request, visitor, traceId, threadId, startedAt,
    run: (onEvent) => runChatTurn({ threadId, visitorId: visitor.visitorId, message: body.message, traceId, signal: request.signal, onEvent }),
  });
}
