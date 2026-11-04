import { NextResponse } from 'next/server';
import { storefrontTools } from '@/features/agent/tools';
import type { TurnEvent, TurnResult } from '@/features/agent/session';
import { productCardsForSources } from '@/features/chat/product-cards';
import type { visitorSession } from '@/features/chat/visitor';
import { logger } from '@/lib/logger';

const encoder = new TextEncoder();

/**
 * Server-sent events for one chat turn: `start`, then `status`/`partial` while it runs, then `complete` (or `error`).
 * `complete` carries whatever the widget must do next: show approval/confirmation state, or refresh the storefront
 * (cart badge) when a cart or order tool ran.
 */
export function turnStream(options: {
  request: Request;
  visitor: Awaited<ReturnType<typeof visitorSession>>;
  traceId: string;
  threadId: string;
  startedAt: number;
  /** Adds the names of the tools the agent called to the result (admin Chat thử only; never sent to visitors). */
  debug?: boolean;
  run: (onEvent: (event: TurnEvent) => void) => Promise<TurnResult | { resumed: false }>;
}) {
  const { request, visitor, traceId, threadId, startedAt } = options;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (type: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { threadId, traceId });
      try {
        const result = await options.run((event) => event.type === 'partial' ? send('partial', { answer: event.answer, checkingSources: true }) : send('status', { status: event.status }));
        const base = { citedSourceIds: [] as string[], insufficientInformation: false, sources: [] as unknown[], traceId };
        if ('resumed' in result) {
          send('complete', { ...base, answer: 'Thao tác này đã được xử lý trước đó.', refresh: true });
        } else {
          const refresh = result.kind !== 'blocked' && result.toolCalls.some((name) => storefrontTools.has(name));
          const debug = options.debug && result.kind !== 'blocked' ? { toolCalls: result.toolCalls } : {};
          if (result.kind === 'answer') {
            // A failed lookup must not lose the answer: the widget just shows no product boxes.
            const products = await productCardsForSources(result.answer.sources).catch(() => []);
            send('complete', { ...base, answer: result.answer.answer, citedSourceIds: result.answer.citedSourceIds, insufficientInformation: result.answer.insufficientInformation, sources: result.answer.sources, products, refresh, ...debug });
          }
          else if (result.kind === 'pending') send('complete', { ...base, answer: result.message, pendingApproval: { id: result.approval.approvalId, summary: result.approval.summary }, refresh, ...debug });
          else if (result.kind === 'confirm') send('complete', { ...base, answer: result.message, pendingConfirmation: { id: result.confirmation.confirmationId, action: result.confirmation.action, summary: result.confirmation.summary, details: result.confirmation.details }, refresh, ...debug });
          else send('complete', { ...base, answer: result.message, ...(result.approvalId ? { pendingApproval: { id: result.approvalId } } : {}), ...(result.confirmationId ? { pendingConfirmation: { id: result.confirmationId } } : {}) });
          logger.info({ trace_id: traceId, stage: 'chat.completed', kind: result.kind, latencyMs: Date.now() - startedAt });
        }
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
