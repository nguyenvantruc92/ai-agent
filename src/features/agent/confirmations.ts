import { randomUUID } from 'node:crypto';
import { sql } from '@/db/client';
import type { CancelPayload, CheckoutPayload } from '@/features/agent/shop-types';
import { audit } from '@/features/orders/repository';

/**
 * Customer confirmation for anything that spends money or cannot be undone (checkout, cancelling an order).
 * It mirrors staff approvals, but the decision comes from the customer's own browser (POST
 * /api/chat/confirmations/:id, tied to the visitor cookie), never from the model.
 */

export const CONFIRMATION_TTL_MINUTES = 30;

export type ConfirmationAction = 'checkout' | 'cancel_order';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed' | 'failed';
export type ConfirmationPayload = CheckoutPayload | CancelPayload;

export type ConfirmationRow = {
  id: string;
  thread_id: string;
  action: ConfirmationAction;
  payload: ConfirmationPayload;
  summary: string;
  details: string[];
  fingerprint: string;
  status: ConfirmationStatus;
  result: unknown;
  created_at: Date;
  decided_at: Date | null;
  expires_at: Date;
};

export type ConfirmationInput = { threadId: string; action: ConfirmationAction; payload: ConfirmationPayload; summary: string; details: string[]; fingerprint: string };

/** The subset of confirmation storage the graph needs; tests provide an in-memory version. */
export type ConfirmationStore = {
  /** Creates the pending confirmation for the thread, replacing any older pending one. */
  create(input: ConfirmationInput): Promise<{ id: string }>;
};

export const postgresConfirmations: ConfirmationStore = {
  async create(input) {
    const id = randomUUID();
    await sql.begin(async (tx) => {
      await tx`UPDATE customer_confirmations SET status = 'cancelled', decided_at = now() WHERE thread_id = ${input.threadId} AND status = 'pending'`;
      await tx`
        INSERT INTO customer_confirmations (id, thread_id, action, payload, summary, details, fingerprint, expires_at)
        VALUES (${id}, ${input.threadId}, ${input.action}, ${sql.json(input.payload as never)}, ${input.summary}, ${sql.json(input.details)}, ${input.fingerprint}, now() + ${`${CONFIRMATION_TTL_MINUTES} minutes`}::interval)
      `;
    });
    await audit('agent', 'confirmation.requested', 'customer_confirmation', id, { threadId: input.threadId, action: input.action });
    return { id };
  },
};

export async function getConfirmation(id: string) {
  const [row] = await sql<ConfirmationRow[]>`SELECT * FROM customer_confirmations WHERE id = ${id}`;
  return row;
}

export async function pendingConfirmationForThread(threadId: string) {
  const [row] = await sql<ConfirmationRow[]>`SELECT * FROM customer_confirmations WHERE thread_id = ${threadId} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`;
  return row;
}

export const isExpired = (row: Pick<ConfirmationRow, 'expires_at'>, now = new Date()) => new Date(row.expires_at).getTime() <= now.getTime();

/** Atomic pending → decided transition. A confirmation that ran out of time can no longer be confirmed. */
export async function decideConfirmation(id: string, status: 'confirmed' | 'cancelled' | 'expired') {
  const [row] = await sql<ConfirmationRow[]>`
    UPDATE customer_confirmations SET status = ${status}, decided_at = now()
    WHERE id = ${id} AND status = 'pending' ${status === 'confirmed' ? sql`AND expires_at > now()` : sql``}
    RETURNING *
  `;
  if (row) await audit('customer', `confirmation.${status}`, 'customer_confirmation', id, { threadId: row.thread_id, action: row.action });
  return row;
}

/** Claims a confirmed confirmation for execution exactly once. */
export async function claimConfirmation(id: string, threadId: string, action: ConfirmationAction) {
  const [row] = await sql<ConfirmationRow[]>`
    UPDATE customer_confirmations SET status = 'executed'
    WHERE id = ${id} AND thread_id = ${threadId} AND action = ${action} AND status = 'confirmed'
    RETURNING *
  `;
  return row;
}

export async function finishConfirmation(id: string, status: 'executed' | 'failed', result: unknown) {
  await sql`UPDATE customer_confirmations SET status = ${status}, result = ${sql.json(result as never)} WHERE id = ${id}`;
}
