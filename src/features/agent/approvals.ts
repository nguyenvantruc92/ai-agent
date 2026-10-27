import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import { audit } from '@/features/orders/repository';
import type { RequestAction } from '@/features/orders/types';

export const APPROVAL_EXPIRY_DAYS = 7;

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalRow = {
  id: string;
  thread_id: string;
  action: RequestAction;
  payload: Record<string, string>;
  summary: string;
  source_ids: string[];
  idempotency_key: string;
  status: ApprovalStatus;
  reviewer: string | null;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
  expires_at: Date;
};

export type ApprovalInput = { threadId: string; action: RequestAction; payload: Record<string, string>; summary: string; sourceIds: string[]; idempotencyKey: string };

/** The subset of approval storage the graph needs; tests provide an in-memory version. */
export type ApprovalStore = {
  /** Returns the live (pending/approved) approval for the key, creating a pending one if none exists. */
  ensure(input: ApprovalInput): Promise<{ id: string; threadId: string; status: ApprovalStatus }>;
};

export const postgresApprovals: ApprovalStore = {
  async ensure(input) {
    const [existing] = await sql<ApprovalRow[]>`SELECT * FROM approval_requests WHERE idempotency_key = ${input.idempotencyKey} AND status IN ('pending', 'approved')`;
    if (existing) return { id: existing.id, threadId: existing.thread_id, status: existing.status };
    const id = randomUUID();
    const inserted = await sql<ApprovalRow[]>`
      INSERT INTO approval_requests (id, thread_id, action, payload, summary, source_ids, idempotency_key, expires_at)
      VALUES (${id}, ${input.threadId}, ${input.action}, ${sql.json(input.payload)}, ${input.summary}, ${sql.json(input.sourceIds)}, ${input.idempotencyKey}, now() + ${`${APPROVAL_EXPIRY_DAYS} days`}::interval)
      ON CONFLICT (idempotency_key) WHERE status IN ('pending', 'approved') DO NOTHING
      RETURNING *
    `;
    if (!inserted.length) return this.ensure(input);
    await audit('agent', 'approval.requested', 'approval_request', id, { threadId: input.threadId, idempotencyKey: input.idempotencyKey });
    return { id, threadId: input.threadId, status: 'pending' };
  },
};

export async function getApproval(id: string) {
  const [row] = await sql<ApprovalRow[]>`SELECT * FROM approval_requests WHERE id = ${id}`;
  return row;
}

export async function pendingApprovalForThread(threadId: string) {
  const [row] = await sql<ApprovalRow[]>`SELECT * FROM approval_requests WHERE thread_id = ${threadId} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`;
  return row;
}

export async function listApprovals() {
  return sql<ApprovalRow[]>`
    SELECT * FROM approval_requests
    ORDER BY (status = 'pending') DESC, created_at DESC
    LIMIT 100
  `;
}

/** Atomic pending → decided transition; returns undefined if it was already decided. */
export async function decideApproval(id: string, status: Exclude<ApprovalStatus, 'pending'>, reviewer: string, note: string | null) {
  const [row] = await sql<ApprovalRow[]>`
    UPDATE approval_requests SET status = ${status}, reviewer = ${reviewer}, note = ${note}, decided_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `;
  if (row) await audit(reviewer, `approval.${status}`, 'approval_request', id, { threadId: row.thread_id, note });
  return row;
}

export async function expiredApprovals() {
  return sql<ApprovalRow[]>`SELECT * FROM approval_requests WHERE status = 'pending' AND expires_at < now()`;
}
