import { NextResponse } from 'next/server';
import { pendingApprovalForThread } from '@/features/agent/approvals';
import { threadMessages } from '@/features/agent/session';
import { ownedThread, visitorSession } from '@/features/chat/visitor';

type Context = { params: Promise<{ id: string }> };

/** Lets the visitor reload a conversation and poll for the answer after an approval decision. */
export async function GET(_: Request, { params }: Context) {
  const visitor = await visitorSession();
  const threadId = await ownedThread((await params).id, visitor.visitorId);
  if (!threadId) return NextResponse.json({ error: 'Không tìm thấy cuộc trò chuyện.' }, { status: 404 });
  const [messages, pending] = await Promise.all([threadMessages(threadId), pendingApprovalForThread(threadId)]);
  return NextResponse.json({
    threadId,
    pendingApproval: pending ? { id: pending.id, summary: pending.summary } : null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      answer: message.content,
      sources: message.metadata.sources ?? [],
      insufficient: message.insufficient_information,
      traceId: message.metadata.traceId,
      kind: message.metadata.kind,
    })),
  });
}
