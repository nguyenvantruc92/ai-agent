import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics of the web process, served at /api/metrics (token-protected). Labels are low-cardinality on
 * purpose: never a thread, visitor, order, phone or message, only names an admin controls (tool, model, action).
 * One registry per process, kept on globalThis so Next.js dev reloads do not register the metrics twice.
 */
function create() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'fashion_' });
  const seconds = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60];
  return {
    registry,
    chatTurn: new Histogram({ name: 'fashion_chat_turn_duration_seconds', help: 'One chat turn, request to final event.', labelNames: ['kind', 'outcome'], buckets: seconds, registers: [registry] }),
    dependencyCall: new Histogram({ name: 'fashion_dependency_call_duration_seconds', help: 'Calls to OpenAI and MCP servers.', labelNames: ['dependency', 'operation', 'outcome'], buckets: seconds, registers: [registry] }),
    retrieval: new Histogram({ name: 'fashion_retrieval_duration_seconds', help: 'Knowledge retrieval (embedding + search).', buckets: seconds, registers: [registry] }),
    retrievalEmpty: new Counter({ name: 'fashion_retrieval_empty_total', help: 'Retrievals that returned no chunk.', registers: [registry] }),
    rateLimit: new Counter({ name: 'fashion_rate_limit_total', help: 'Rate-limit decisions.', labelNames: ['action', 'outcome'], registers: [registry] }),
    tokens: new Counter({ name: 'fashion_tokens_total', help: 'Model tokens.', labelNames: ['kind'], registers: [registry] }),
    guard: new Counter({ name: 'fashion_guardrail_blocked_total', help: 'Messages refused by the prompt-injection guard.', registers: [registry] }),
    agentRoute: new Counter({ name: 'fashion_agent_answers_total', help: 'Final agent answers by route and validation result.', labelNames: ['route', 'validation'], registers: [registry] }),
    approvalPending: new Gauge({ name: 'fashion_approval_pending', help: 'Approval requests waiting for staff.', registers: [registry] }),
    approvalOldest: new Gauge({ name: 'fashion_approval_oldest_pending_seconds', help: 'Age of the oldest pending approval.', registers: [registry] }),
    confirmationPending: new Gauge({ name: 'fashion_confirmation_pending', help: 'Customer confirmations waiting for a click.', registers: [registry] }),
    circuitState: new Gauge({ name: 'fashion_circuit_state', help: 'Circuit breaker state: 0 closed, 1 half-open, 2 open.', labelNames: ['circuit'], registers: [registry] }),
    ingestionFailed: new Gauge({ name: 'fashion_ingestion_failed_24h', help: 'Ingestion jobs failed in the last 24 hours.', registers: [registry] }),
  };
}

type Metrics = ReturnType<typeof create>;
const holder = globalThis as typeof globalThis & { __fashionMetrics?: Metrics };
export const metrics: Metrics = holder.__fashionMetrics ??= create();

/** Metrics must never break a request: every update goes through this. */
export function safely(update: () => void) {
  try { update(); } catch { /* telemetry is best effort */ }
}
