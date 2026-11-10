import { sql } from '@/db/client';

export type Backlog = { approvalsPending: number; approvalOldestSeconds: number | null; confirmationsPending: number; ingestionFailed24h: number };

/** Work waiting on people or failing in the background, read straight from the database (not from logs). */
export async function operationalBacklog(): Promise<Backlog> {
  const [row] = await sql<{ approvals_pending: number; approval_oldest_seconds: number | null; confirmations_pending: number; ingestion_failed_24h: number }[]>`
    SELECT
      (SELECT count(*)::int FROM approval_requests WHERE status = 'pending') AS approvals_pending,
      (SELECT floor(extract(epoch FROM now() - min(created_at)))::int FROM approval_requests WHERE status = 'pending') AS approval_oldest_seconds,
      (SELECT count(*)::int FROM customer_confirmations WHERE status = 'pending' AND expires_at > now()) AS confirmations_pending,
      (SELECT count(*)::int FROM ingestion_jobs WHERE status = 'failed' AND coalesce(finished_at, created_at) > now() - interval '24 hours') AS ingestion_failed_24h
  `;
  return { approvalsPending: row.approvals_pending, approvalOldestSeconds: row.approval_oldest_seconds, confirmationsPending: row.confirmations_pending, ingestionFailed24h: row.ingestion_failed_24h };
}
