import { operationalBacklog } from '@/features/monitoring/backlog';
import { env } from '@/lib/env';
import { metrics, safely } from '@/lib/metrics';
import { bearerMatches } from '@/mcp/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prometheus scrape endpoint. The web app is reachable through the tunnel, so it needs METRICS_TOKEN as a Bearer
 * token; without a configured token it does not exist (404). Labels never carry customer data (see lib/metrics.ts).
 */
export async function GET(request: Request) {
  if (!env.METRICS_TOKEN) return new Response('Not found', { status: 404 });
  if (!bearerMatches(request.headers.get('authorization'), env.METRICS_TOKEN)) return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } });
  // Backlog gauges are read at scrape time; a database hiccup must not hide the process metrics.
  try {
    const backlog = await operationalBacklog();
    safely(() => {
      metrics.approvalPending.set(backlog.approvalsPending);
      metrics.approvalOldest.set(backlog.approvalOldestSeconds ?? 0);
      metrics.confirmationPending.set(backlog.confirmationsPending);
      metrics.ingestionFailed.set(backlog.ingestionFailed24h);
    });
  } catch { /* stale gauges are better than no scrape */ }
  return new Response(await metrics.registry.metrics(), { headers: { 'content-type': metrics.registry.contentType, 'cache-control': 'no-store' } });
}
