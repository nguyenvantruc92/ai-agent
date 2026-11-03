import { NextResponse } from 'next/server';
import { pendingApprovalForThread } from '@/features/agent/approvals';
import { isExpired, pendingConfirmationForThread } from '@/features/agent/confirmations';
import { threadMessages } from '@/features/agent/session';
import { ownedThread, visitorSession } from '@/features/chat/visitor';

type Context = { params: Promise<{ id: string }> };

/** Lets the visitor reload a conversation and poll for the answer after an approval decision. */
export async function GET(_: Request, { params }: Context) {
  const visitor = await visitorSession();
  const threadId = await ownedThread((await params).id, visitor.visitorId);
  if (!threadId) return NextResponse.json({ error: 'Không tìm thấy cuộc trò chuyện.' }, { status: 404 });
  const [messages, pending, confirmation] = await Promise.all([threadMessages(threadId), pendingApprovalForThread(threadId), pendingConfirmationForThread(threadId)]);
  return NextResponse.json({
    threadId,
    pendingApproval: pending ? { id: pending.id, summary: pending.summary } : null,
    // An expired question is closed by the next message the customer sends, so it is no longer offered as a button.
    pendingConfirmation: confirmation && !isExpired(confirmation) ? { id: confirmation.id, action: confirmation.action, summary: confirmation.summary, details: confirmation.details } : null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      answer: message.content,
      sources: message.metadata.sources ?? [],
      insufficient: message.insufficient_information,
      traceId: message.metadata.traceId,
      kind: message.metadata.kind,
      confirmationId: message.metadata.confirmationId,
    })),
  });
}
