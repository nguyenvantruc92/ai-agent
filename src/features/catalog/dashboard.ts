import { sql } from '@/db/client';
import { LOW_STOCK_AVERAGE } from '@/features/catalog/stock';
import { catalogStorageKey } from '@/features/catalog/sync';
import { friendlyError } from '@/lib/friendly-error';

export type SyncState = { state: 'none' | 'syncing' | 'ok' | 'failed'; at: string | null; error: string | null };

/** Health of the chatbot's product index: did the last catalog re-index finish? */
async function syncState(): Promise<SyncState> {
  const [job] = await sql<{ status: string; error: string | null; at: Date | null }[]>`
    SELECT j.status, j.error, coalesce(j.finished_at, j.created_at) AS at
    FROM ingestion_jobs j JOIN knowledge_documents d ON d.id = j.document_id
    WHERE d.storage_key = ${catalogStorageKey}
    ORDER BY j.created_at DESC LIMIT 1
  `;
  if (!job) return { state: 'none', at: null, error: null };
  const state = job.status === 'completed' ? 'ok' : job.status === 'failed' ? 'failed' : 'syncing';
  return { state, at: job.at ? new Date(job.at).toISOString() : null, error: job.error ? friendlyError(job.error) : null };
}

/** Small, cheap numbers shown on every admin page (sidebar badge, top bar). */
export async function getShellStatus() {
  const [[{ pending }], [{ processing }], sync] = await Promise.all([
    sql<{ pending: number }[]>`SELECT count(*)::int AS pending FROM approval_requests WHERE status = 'pending'`,
    sql<{ processing: number }[]>`SELECT count(*)::int AS processing FROM orders WHERE status = 'processing'`,
    syncState(),
  ]);
  return { pendingApprovals: pending, processingOrders: processing, sync };
}

export type AttentionProduct = { id: string; code: string; name: string; category: string; stock: number; variants: number; level: 'out' | 'low' };
export type ActivityItem = { id: string; actor: string; action: string; entityType: string; entityId: string; details: Record<string, unknown>; createdAt: string };

export async function getDashboard() {
  const [[counts], [categories], stockRows, byCategory, activity, shell] = await Promise.all([
    sql<{ active: number; draft: number; archived: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'draft')::int AS draft,
        count(*) FILTER (WHERE status = 'archived')::int AS archived
      FROM products WHERE deleted_at IS NULL`,
    sql<{ total: number; visible: number }[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS visible FROM categories`,
    sql<{ id: string; code: string; name: string; category: string; stock: number; variants: number }[]>`
      SELECT p.id, p.code, p.name, c.name AS category,
        coalesce(sum(v.stock) FILTER (WHERE v.is_active), 0)::int AS stock, count(v.id) FILTER (WHERE v.is_active)::int AS variants
      FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.status = 'active'
      GROUP BY p.id, c.name`,
    sql<{ name: string; count: number }[]>`
      SELECT c.name, count(p.id)::int AS count FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.sort_order, c.name`,
    sql<ActivityItem[]>`
      SELECT a.id, a.actor, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
        a.details || jsonb_build_object('productCode', p.code) AS details, a.created_at AS "createdAt"
      FROM audit_logs a LEFT JOIN products p ON a.entity_type = 'product' AND p.id::text = a.entity_id
      ORDER BY a.created_at DESC LIMIT 8`,
    getShellStatus(),
  ]);

  // Same rule as features/catalog/stock.ts, evaluated here so one query serves the whole list.
  const attention: AttentionProduct[] = stockRows
    .map((row) => ({ ...row, level: row.stock === 0 || row.variants === 0 ? 'out' as const : row.stock / row.variants <= LOW_STOCK_AVERAGE ? 'low' as const : null }))
    .filter((row): row is AttentionProduct => row.level !== null)
    .sort((a, b) => (a.level === b.level ? a.stock / Math.max(a.variants, 1) - b.stock / Math.max(b.variants, 1) : a.level === 'out' ? -1 : 1));

  return {
    products: counts,
    categories,
    outOfStock: attention.filter((item) => item.level === 'out').length,
    lowStock: attention.filter((item) => item.level === 'low').length,
    attention: attention.slice(0, 8),
    byCategory,
    activity: activity.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
    ...shell,
  };
}

export async function productStatusCounts() {
  const [row] = await sql<{ all: number; active: number; draft: number; archived: number }[]>`
    SELECT count(*)::int AS "all", count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status = 'draft')::int AS draft, count(*) FILTER (WHERE status = 'archived')::int AS archived
    FROM products WHERE deleted_at IS NULL`;
  return row;
}
