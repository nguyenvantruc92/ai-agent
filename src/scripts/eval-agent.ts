import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '@/db/client';
import { pendingApprovalForThread } from '@/features/agent/approvals';
import { resetAgentRuntime } from '@/features/agent/runtime';
import { pendingConfirmationForThread } from '@/features/agent/confirmations';
import { decideAndResume, decideAndResumeConfirmation, runChatTurn, type TurnResult } from '@/features/agent/session';
import { resetSeedOrders } from '@/features/orders/repository';
import { env } from '@/lib/env';

type Step = { user: string } | { decision: 'approved' | 'rejected' | 'expired'; note?: string } | { confirm: 'confirmed' | 'cancelled' } | { restart: true };
type Expect = {
  finalKind?: TurnResult['kind'];
  route?: string;
  pendingAction?: 'exchange_size' | 'return';
  /** The customer is being asked to confirm this action (buttons Xác nhận / Huỷ). */
  pendingConfirmation?: 'checkout' | 'cancel_order';
  /** Customer orders created by this case (not the demo ones), and lines left in the cart. */
  orders?: number;
  cartLines?: number;
  orderStatus?: { orderId: string; status: string };
  toolsInclude?: string[];
  toolsExclude?: string[];
  anyKeywords?: string[];
  forbiddenKeywords?: string[];
  insufficient?: boolean;
  requests?: { orderId: string; count: number };
};
type Case = { id: string; category: string; steps: Step[]; expect: Expect };

const visitorId = 'eval-agent';
const lower = (value: string) => value.toLocaleLowerCase('vi-VN');

async function requestCount(orderId?: string) {
  const [row] = orderId
    ? await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM exchange_return_requests WHERE order_id = ${orderId}`
    : await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM exchange_return_requests`;
  return row.count;
}

/** Removes what shopping cases create (orders, carts) and puts their stock back, so cases stay independent. */
async function cleanShopping() {
  await sql`
    UPDATE product_variants v SET stock = stock + oi.quantity
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.variant_id = v.id AND o.visitor_id = ${visitorId} AND o.status <> 'cancelled'
  `;
  await sql`DELETE FROM orders WHERE visitor_id = ${visitorId}`;
  await sql`DELETE FROM carts WHERE visitor_id = ${visitorId}`;
}
const customerOrderCount = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM orders WHERE visitor_id = ${visitorId}`)[0].n;
const cartLineCount = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM cart_items WHERE visitor_id = ${visitorId}`)[0].n;

async function runCase(test: Case) {
  await cleanShopping();
  await resetSeedOrders();
  const threadId = randomUUID();
  await sql`INSERT INTO chat_threads (id, visitor_id) VALUES (${threadId}, ${visitorId})`;
  const startedAt = Date.now();
  const tools: string[] = [];
  const traces: string[] = [];
  const violations: string[] = [];
  let final: TurnResult | undefined;
  let tokens = 0;

  for (const step of test.steps) {
    if ('restart' in step) { await resetAgentRuntime(); continue; }
    const traceId = randomUUID();
    traces.push(traceId);
    const before = await requestCount();
    if ('user' in step) {
      final = await runChatTurn({ threadId, visitorId, message: step.user, traceId });
    } else if ('confirm' in step) {
      const pending = await pendingConfirmationForThread(threadId);
      if (!pending) { violations.push(`no pending confirmation for ${step.confirm}`); continue; }
      const outcome = await decideAndResumeConfirmation({ confirmationId: pending.id, threadId, decision: step.confirm, traceId });
      if (outcome.resumed) final = outcome.result;
    } else {
      const pending = await pendingApprovalForThread(threadId);
      if (!pending) { violations.push(`no pending approval for decision ${step.decision}`); continue; }
      const outcome = await decideAndResume({ approvalId: pending.id, decision: step.decision, reviewer: 'eval', note: step.note ?? null, traceId });
      if (outcome.resumed) final = outcome.result;
    }
    if (final && final.kind !== 'blocked') tools.push(...final.toolCalls);
    if (final?.kind === 'answer') tokens += final.answer.diagnostics.inputTokens + final.answer.diagnostics.outputTokens;
    // Invariants for every case: nothing is written while a request is only proposed, and no order exists before the customer confirms.
    if (final?.kind === 'confirm' && (await customerOrderCount()) !== 0) violations.push('order created before customer confirmation');
    if (final && final.kind !== 'answer' && (await requestCount()) !== before) violations.push('write happened before approval');
    if ('user' in step && final?.kind === 'answer' && (await requestCount()) !== before) violations.push('write happened without an approval decision');
  }

  const expect = test.expect;
  const failures = [...violations];
  const answerText = final?.kind === 'answer' ? final.answer.answer : final?.message ?? '';
  if (expect.finalKind && final?.kind !== expect.finalKind) failures.push(`kind ${final?.kind} ≠ ${expect.finalKind}`);
  if (expect.route && (final?.kind !== 'answer' || final.answer.diagnostics.route !== expect.route)) failures.push(`route ≠ ${expect.route}`);
  if (expect.pendingAction && (final?.kind !== 'pending' || final.approval.action !== expect.pendingAction)) failures.push(`pending action ≠ ${expect.pendingAction}`);
  if (expect.pendingConfirmation && (final?.kind !== 'confirm' || final.confirmation.action !== expect.pendingConfirmation)) failures.push(`pending confirmation ≠ ${expect.pendingConfirmation}`);
  if (expect.orders !== undefined && (await customerOrderCount()) !== expect.orders) failures.push(`customer orders = ${await customerOrderCount()} ≠ ${expect.orders}`);
  if (expect.cartLines !== undefined && (await cartLineCount()) !== expect.cartLines) failures.push(`cart lines = ${await cartLineCount()} ≠ ${expect.cartLines}`);
  if (expect.orderStatus) {
    const [row] = await sql<{ status: string }[]>`SELECT status FROM orders WHERE id = ${expect.orderStatus.orderId}`;
    if (row?.status !== expect.orderStatus.status) failures.push(`order ${expect.orderStatus.orderId} is ${row?.status} ≠ ${expect.orderStatus.status}`);
  }
  for (const tool of expect.toolsInclude ?? []) if (!tools.includes(tool)) failures.push(`missing tool ${tool}`);
  for (const tool of expect.toolsExclude ?? []) if (tools.includes(tool)) failures.push(`unexpected tool ${tool}`);
  if (expect.anyKeywords?.length && !expect.anyKeywords.some((keyword) => lower(answerText).includes(lower(keyword)))) failures.push(`none of keywords ${JSON.stringify(expect.anyKeywords)}`);
  for (const keyword of expect.forbiddenKeywords ?? []) if (lower(answerText).includes(lower(keyword))) failures.push(`forbidden keyword ${keyword}`);
  if (expect.insufficient !== undefined && (final?.kind !== 'answer' || final.answer.insufficientInformation !== expect.insufficient)) failures.push(`insufficient ≠ ${expect.insufficient}`);
  if (expect.requests && (await requestCount(expect.requests.orderId)) !== expect.requests.count) failures.push(`requests for ${expect.requests.orderId} = ${await requestCount(expect.requests.orderId)} ≠ ${expect.requests.count}`);

  return {
    id: test.id,
    category: test.category,
    passed: failures.length === 0,
    failures,
    finalKind: final?.kind ?? null,
    route: final?.kind === 'answer' ? final.answer.diagnostics.route : null,
    validation: final?.kind === 'answer' ? final.answer.diagnostics.validation : null,
    citations: final?.kind === 'answer' ? final.answer.citedSourceIds : [],
    tools,
    steps: tools.length,
    tokens,
    latencyMs: Date.now() - startedAt,
    traceIds: traces,
    answer: answerText,
    error: null as string | null,
  };
}

async function main() {
  const cases = JSON.parse(await readFile(join(process.cwd(), 'evals/agent-golden-set.v1.json'), 'utf8')) as Case[];
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  for (const test of cases) {
    try {
      results.push(await runCase(test));
    } catch (error) {
      results.push({ id: test.id, category: test.category, passed: false, failures: ['error'], finalKind: null, route: null, validation: null, citations: [], tools: [], steps: 0, tokens: 0, latencyMs: 0, traceIds: [], answer: '', error: error instanceof Error ? error.message : String(error) });
    }
    const last = results.at(-1)!;
    console.log(`${last.passed ? 'PASS' : 'FAIL'} ${last.id}${last.passed ? '' : ` — ${last.error ?? last.failures.join('; ')}`}`);
  }
  await cleanShopping();
  await resetSeedOrders();

  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const summary = {
    goldenSet: 'agent-golden-set.v1',
    model: env.OPENAI_CHAT_MODEL,
    limits: { maxSteps: env.AGENT_MAX_STEPS, maxToolCalls: env.AGENT_MAX_TOOL_CALLS },
    cases: results.length,
    passed: results.filter((item) => item.passed).length,
    errors: results.filter((item) => item.error).length,
    writesBeforeApproval: results.filter((item) => item.failures.some((failure) => failure.startsWith('write happened'))).length,
    byCategory: Object.fromEntries([...new Set(results.map((item) => item.category))].map((category) => {
      const items = results.filter((item) => item.category === category);
      return [category, `${items.filter((item) => item.passed).length}/${items.length}`];
    })),
    latencyMs: { avg: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)), p95: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? 0 },
    totalTokens: results.reduce((sum, item) => sum + item.tokens, 0),
  };
  const outputDir = join(process.cwd(), 'data', 'eval-results');
  await mkdir(outputDir, { recursive: true });
  const destination = join(outputDir, `agent-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(destination, JSON.stringify({ ...summary, results }, null, 2));
  console.log(JSON.stringify({ ...summary, destination }, null, 2));
  for (const item of results.filter((result) => !result.passed)) {
    console.log(`\n[${item.id}] ${item.error ?? item.failures.join('; ')}\n  kind=${item.finalKind} tools=${item.tools.join(' → ')}\n  answer=${item.answer.slice(0, 220)}`);
  }
  await resetAgentRuntime();
  await sql.end();
}

void main();
