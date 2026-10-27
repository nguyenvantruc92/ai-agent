import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { expiredApprovals } from '@/features/agent/approvals';
import { createStore, getAgentRuntime } from '@/features/agent/runtime';
import { decideAndResume } from '@/features/agent/session';
import { workerLogger } from '@/lib/logger';

const RETENTION_DAYS = 30;

/** Pending approvals past expires_at become `expired` and their threads resume so the customer is told. */
export async function expireApprovals() {
  for (const approval of await expiredApprovals()) {
    const traceId = randomUUID();
    try {
      await decideAndResume({ approvalId: approval.id, decision: 'expired', reviewer: 'system', note: null, traceId });
      workerLogger.info({ trace_id: traceId, stage: 'maintenance.approval_expired', approvalId: approval.id });
    } catch (error) {
      workerLogger.error({ trace_id: traceId, stage: 'maintenance.expire_failed', approvalId: approval.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** Deletes LangGraph checkpoints of threads idle for 30 days and sweeps expired memory items. */
export async function cleanupAgentState() {
  const { checkpointer } = getAgentRuntime();
  const threads = await sql<{ id: string }[]>`SELECT id FROM chat_threads WHERE updated_at < now() - ${`${RETENTION_DAYS} days`}::interval`;
  for (const thread of threads) await checkpointer.deleteThread(thread.id);
  const store = createStore();
  const swept = await store.sweepExpiredItems();
  await store.stop();
  workerLogger.info({ stage: 'maintenance.cleanup', checkpointThreadsDeleted: threads.length, memoryItemsSwept: swept });
}
