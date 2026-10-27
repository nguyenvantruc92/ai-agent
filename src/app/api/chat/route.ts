import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (type: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { threadId, traceId });
      try {
        const result = await runChatTurn({
          threadId,
          visitorId: visitor.visitorId,
          message: body.message,
          traceId,
          signal: request.signal,
          onEvent: (event) => event.type === 'partial'
            ? send('partial', { answer: event.answer, checkingSources: true })
            : send('status', { status: event.status }),
        });
        if (result.kind === 'answer') {
          send('complete', { answer: result.answer.answer, citedSourceIds: result.answer.citedSourceIds, insufficientInformation: result.answer.insufficientInformation, sources: result.answer.sources, traceId });
        } else if (result.kind === 'pending') {
          send('complete', { answer: result.message, citedSourceIds: [], insufficientInformation: false, sources: [], traceId, pendingApproval: { id: result.approval.approvalId, summary: result.approval.summary } });
        } else {
          send('complete', { answer: result.message, citedSourceIds: [], insufficientInformation: false, sources: [], traceId, pendingApproval: { id: result.approvalId } });
        }
        logger.info({ trace_id: traceId, stage: 'chat.completed', kind: result.kind, latencyMs: Date.now() - startedAt });
      } catch (error) {
        const aborted = request.signal.aborted;
        logger.error({ trace_id: traceId, stage: aborted ? 'chat.aborted' : 'chat.failed', latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
        if (!aborted) send('error', { message: 'Không thể hoàn tất câu trả lời. Vui lòng thử lại.', traceId });
      } finally {
        controller.close();
      }
    },
  });
  return visitor.persist(new NextResponse(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } }));
}
