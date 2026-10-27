import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { sql } from '@/db/client';
import { decideApproval, getApproval, pendingApprovalForThread, type ApprovalStatus } from '@/features/agent/approvals';
import type { AgentGraph, ApprovalInterrupt, ApprovalResume } from '@/features/agent/graph';
import { getAgentRuntime } from '@/features/agent/runtime';
import { hashVisitorId } from '@/features/chat/generation';
import type { FinalAnswer, SourceRef } from '@/features/chat/rag-answer';
import { logger } from '@/lib/logger';

export type TurnEvent = { type: 'partial'; answer: string } | { type: 'status'; status: string };

type Common = { traceId: string; toolCalls: string[]; messageId: string };
export type TurnResult =
  | (Common & { kind: 'answer'; answer: FinalAnswer })
  | (Common & { kind: 'pending'; approval: ApprovalInterrupt; message: string })
  | { kind: 'blocked'; traceId: string; approvalId: string; message: string };

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string[];
  insufficient_information: boolean;
  metadata: { kind?: 'answer' | 'approval_pending' | 'approval_result' | 'blocked'; sources?: SourceRef[]; traceId?: string; approvalId?: string; route?: string };
  created_at: Date;
};

async function saveMessage(threadId: string, role: 'user' | 'assistant', content: string, extra: { citations?: string[]; insufficient?: boolean; metadata?: StoredMessage['metadata'] } = {}) {
  const id = randomUUID();
  await sql`
    INSERT INTO chat_messages (id, thread_id, role, content, citations, insufficient_information, metadata)
    VALUES (${id}, ${threadId}, ${role}, ${content}, ${sql.json(extra.citations ?? [])}, ${extra.insufficient ?? false}, ${sql.json(extra.metadata ?? {})})
  `;
  await sql`UPDATE chat_threads SET updated_at = now() WHERE id = ${threadId}`;
  return id;
}

export async function threadMessages(threadId: string) {
  return sql<StoredMessage[]>`SELECT id, role, content, citations, insufficient_information, metadata, created_at FROM chat_messages WHERE thread_id = ${threadId} ORDER BY created_at`;
}

const pendingText = (approval: ApprovalInterrupt) =>
  `Mình đã kiểm tra đơn hàng và điều kiện đổi/trả: ${approval.summary}. Yêu cầu đã được chuyển cho nhân viên duyệt; Fashion Tomodev sẽ phản hồi ngay tại cuộc trò chuyện này khi có kết quả.`;

/** Tool names the agent called since the latest user message (for traces and evals). */
function toolCallsThisTurn(messages: BaseMessage[]) {
  const start = messages.findLastIndex((message) => HumanMessage.isInstance(message));
  return messages.slice(start + 1).flatMap((message) => AIMessage.isInstance(message) ? (message.tool_calls ?? []).map((call) => call.name) : []);
}

async function runAndFinish(graph: AgentGraph, input: Parameters<AgentGraph['stream']>[0], threadId: string, traceId: string, kind: 'answer' | 'approval_result', signal: AbortSignal | undefined, onEvent?: (event: TurnEvent) => void): Promise<TurnResult> {
  const config = { configurable: { thread_id: threadId, trace_id: traceId }, recursionLimit: 40, signal };
  const stream = await graph.stream(input, { ...config, streamMode: ['custom'] as const });
  for await (const [, chunk] of stream) onEvent?.(chunk as TurnEvent);

  const state = await graph.getState(config);
  const toolCalls = toolCallsThisTurn(state.values.messages ?? []);
  const interrupt = state.tasks.flatMap((task) => task.interrupts ?? []).map((item) => item.value as ApprovalInterrupt).find(Boolean);
  if (interrupt) {
    const message = pendingText(interrupt);
    const messageId = await saveMessage(threadId, 'assistant', message, { citations: [], metadata: { kind: 'approval_pending', approvalId: interrupt.approvalId, traceId } });
    logger.info({ trace_id: traceId, stage: 'agent.pending_approval', approvalId: interrupt.approvalId, action: interrupt.action, toolCalls });
    return { kind: 'pending', traceId, toolCalls, messageId, approval: interrupt, message };
  }
  const answer = state.values.finalAnswer as FinalAnswer;
  const messageId = await saveMessage(threadId, 'assistant', answer.answer, {
    citations: answer.citedSourceIds,
    insufficient: answer.insufficientInformation,
    metadata: { kind, sources: answer.sources, traceId, route: answer.diagnostics.route },
  });
  logger.info({ trace_id: traceId, stage: 'agent.completed', route: answer.diagnostics.route, validation: answer.diagnostics.validation, unsupportedNumbers: answer.diagnostics.unsupportedNumbers, toolCalls, steps: toolCalls.length, citations: answer.citedSourceIds, usage: { inputTokens: answer.diagnostics.inputTokens, outputTokens: answer.diagnostics.outputTokens } });
  return { kind: 'answer', traceId, toolCalls, messageId, answer };
}

/** One user message through the graph. Threads waiting for approval do not start a new run. */
export async function runChatTurn(input: { threadId: string; visitorId: string; message: string; traceId: string; signal?: AbortSignal; onEvent?: (event: TurnEvent) => void }): Promise<TurnResult> {
  const pending = await pendingApprovalForThread(input.threadId);
  if (pending) {
    return { kind: 'blocked', traceId: input.traceId, approvalId: pending.id, message: `Yêu cầu "${pending.summary}" đang chờ nhân viên duyệt. Bạn vui lòng đợi kết quả trước khi gửi yêu cầu mới trong cuộc trò chuyện này.` };
  }
  await saveMessage(input.threadId, 'user', input.message);
  const { graph } = getAgentRuntime();
  return runAndFinish(graph, {
    messages: [new HumanMessage(input.message)],
    userId: hashVisitorId(input.visitorId),
    route: null,
    finalAnswer: null,
    turnSources: [],
    modelCalls: 0,
    toolCalls: 0,
    approvalStatus: 'none',
  }, input.threadId, input.traceId, 'answer', input.signal, input.onEvent);
}

export class ApprovalConflictError extends Error {}

/**
 * Records the decision (pending → decided, atomic) and resumes the thread from
 * its checkpoint. Calling it again after a failed resume retries the resume.
 */
export async function decideAndResume(input: { approvalId: string; decision: Exclude<ApprovalStatus, 'pending'>; reviewer: string; note: string | null; traceId: string }) {
  const approval = await getApproval(input.approvalId);
  if (!approval) throw new ApprovalConflictError('Không tìm thấy yêu cầu duyệt.');
  if (approval.status === 'pending') await decideApproval(input.approvalId, input.decision, input.reviewer, input.note);
  const current = await getApproval(input.approvalId);
  if (current!.status !== input.decision) throw new ApprovalConflictError(`Yêu cầu đã ở trạng thái ${current!.status}.`);

  const { graph } = getAgentRuntime();
  const config = { configurable: { thread_id: approval.thread_id } };
  const state = await graph.getState(config);
  const waiting = state.tasks.flatMap((task) => task.interrupts ?? []).some((item) => (item.value as ApprovalInterrupt).approvalId === input.approvalId);
  if (!waiting) return { resumed: false as const, approval: current! };

  const resume: ApprovalResume = { decision: input.decision, note: current!.note };
  logger.info({ trace_id: input.traceId, stage: 'agent.resume', approvalId: input.approvalId, decision: input.decision, threadId: approval.thread_id });
  const result = await runAndFinish(graph, new Command({ resume }), approval.thread_id, input.traceId, 'approval_result', undefined);
  return { resumed: true as const, approval: current!, result };
}
