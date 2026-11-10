import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateAlerts, latestEvalGate, type AlertInput, type AlertThresholds } from '@/features/monitoring/alerts';
import { readLogLines, summarize, type LogLine } from '@/features/monitoring/summary';
import { env } from '@/lib/env';
import { metrics } from '@/lib/metrics';
import { outcomeOf, ToolReportedError, trackDependency } from '@/lib/telemetry';
import { GET as metricsRoute } from '@/app/api/metrics/route';

const captured = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger')>();
  const stream = { write: (line: string) => { captured.lines.push(line); } };
  return { ...actual, logger: actual.createLogger(stream, 'info'), workerLogger: actual.createLogger(stream, 'info') };
});
// The metrics route reads the backlog from Postgres; here the database is "down", which the route must survive.
vi.mock('@/features/monitoring/backlog', () => ({ operationalBacklog: async () => { throw new Error('database unavailable'); } }));

beforeEach(() => { captured.lines.length = 0; });

const call = (dependency: string, operation: string, outcome: string, latencyMs: number): LogLine => ({ stage: 'dependency.call', dependency, operation, outcome, latencyMs });

describe('summarize', () => {
  const lines: LogLine[] = [
    ...Array.from({ length: 9 }, (_, index) => call('openai', 'gpt-4.1', 'ok', 1_000 + index * 100)),
    call('openai', 'gpt-4.1', 'timeout', 20_000),
    call('mcp_builtin', 'verify_order', 'ok', 40),
    call('mcp_builtin', 'verify_order', 'tool_error', 35),
    call('mcp_builtin', 'checkout', 'failed', 15),
    call('mcp_builtin', 'checkout', 'aborted', 5),
    { stage: 'chat.completed', latencyMs: 3_000 }, { stage: 'chat.completed', latencyMs: 5_000 }, { stage: 'chat.failed' },
    { stage: 'agent.completed', route: 'agent', validation: 'valid', usage: { inputTokens: 100, outputTokens: 20 } },
    { stage: 'agent.completed', route: 'limit', validation: 'unsupported_number' },
    { stage: 'retrieval', latencyMs: 200, sourceIds: [], embeddingTokens: 7 },
    { stage: 'guardrail.prompt_injection' },
    { stage: 'rate_limit', outcome: 'rejected' }, { stage: 'rate_limit', outcome: 'allowed' },
  ];
  const data = summarize(lines);

  it('groups dependency calls, separating outages from business errors and ignoring aborted calls', () => {
    expect(data.dependencies).toEqual([
      { dependency: 'mcp_builtin', operation: 'verify_order', calls: 2, p95Ms: 40, failures: 0, toolErrors: 1, failureRate: 0 },
      { dependency: 'mcp_builtin', operation: 'checkout', calls: 1, p95Ms: 15, failures: 1, toolErrors: 0, failureRate: 1 },
      { dependency: 'openai', operation: 'gpt-4.1', calls: 10, p95Ms: 20_000, failures: 1, toolErrors: 0, failureRate: 0.1 },
    ]);
    expect(data.model).toEqual({ calls: 10, failures: 1, p95Ms: 20_000 });
    expect({ calls: data.dependencyCalls, failures: data.dependencyFailures }).toEqual({ calls: 13, failures: 2 });
  });

  it('counts chat, answers, guard, retrieval, rate limit and tokens', () => {
    expect(data.chat).toEqual({ count: 2, p95Ms: 5_000, failed: 1 });
    expect({ answers: data.answers, limit: data.limitAnswers, rejected: data.citationRejected, guard: data.guardBlocked }).toEqual({ answers: 2, limit: 1, rejected: 1, guard: 1 });
    expect(data.retrieval).toEqual({ count: 1, p95Ms: 200, emptyRate: 1 });
    expect(data.rateLimit).toEqual({ allowed: 1, rejected: 1 });
    expect(data.tokens).toEqual({ input: 100, output: 20, embedding: 7 });
  });
});

describe('readLogLines', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'logs-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('keeps lines inside the window, skips broken lines and unrelated files', () => {
    const now = Date.now();
    writeFileSync(join(root, 'web.ndjson'), [JSON.stringify({ time: now - 60_000, stage: 'a' }), '{"broken', JSON.stringify({ time: now - 3_600_000, stage: 'old' })].join('\n'));
    writeFileSync(join(root, 'other.log'), JSON.stringify({ time: now, stage: 'ignored' }));
    expect(readLogLines(15 * 60_000, root).map((line) => line.stage)).toEqual(['a']);
  });
});

describe('evaluateAlerts', () => {
  const t: AlertThresholds = { minSamples: 10, dependencyFailureRate: 0.2, chatP95Ms: 15_000, approvalMaxAgeMinutes: 240, windowMinutes: 15 };
  const quiet: AlertInput = {
    summary: summarize([]),
    backlog: { approvalsPending: 0, approvalOldestSeconds: null, confirmationsPending: 0, ingestionFailed24h: 0 },
    mcp: { healthy: true, latencyMs: 3, error: null },
    latestEval: { file: 'agent-1.json', passed: true },
  };
  const keys = (input: AlertInput) => evaluateAlerts(input, t).map((alert) => alert.key);

  it('is silent when everything is healthy', () => {
    expect(evaluateAlerts(quiet, t)).toEqual([]);
  });

  it('fires on MCP down, a failing dependency, slow chat, an old approval, failed ingestion and a failed eval gate', () => {
    const lines = [
      ...Array.from({ length: 7 }, () => call('openai', 'gpt-4.1', 'ok', 500)),
      ...Array.from({ length: 3 }, () => call('openai', 'gpt-4.1', 'timeout', 20_000)),
      ...Array.from({ length: 10 }, () => ({ stage: 'chat.completed', latencyMs: 20_000 })),
    ];
    const alerts = evaluateAlerts({
      summary: summarize(lines),
      backlog: { approvalsPending: 3, approvalOldestSeconds: 5 * 3600, confirmationsPending: 0, ingestionFailed24h: 2 },
      mcp: { healthy: false, latencyMs: 3_000, error: 'fetch failed' },
      latestEval: { file: 'agent-2.json', passed: false },
    }, t);
    expect(alerts.map((alert) => alert.key)).toEqual(['mcp_builtin_down', 'dependency_failure:openai', 'chat_p95', 'approval_backlog', 'ingestion_failed', 'eval_gate_failed:agent-2.json']);
    expect(alerts.find((alert) => alert.key === 'dependency_failure:openai')).toMatchObject({ severity: 'critical', value: 0.3, threshold: 0.2 });
  });

  it('needs enough samples before judging a rate or a percentile', () => {
    const few = [call('mcp_builtin', 'checkout', 'failed', 10), call('mcp_builtin', 'checkout', 'failed', 10), { stage: 'chat.completed', latencyMs: 60_000 }];
    expect(keys({ ...quiet, summary: summarize(few) })).toEqual([]);
  });

  it('does not count business errors (tool_error) as an outage', () => {
    const lines = Array.from({ length: 20 }, () => call('mcp_builtin', 'verify_order', 'tool_error', 30));
    expect(keys({ ...quiet, summary: summarize(lines) })).toEqual([]);
  });
});

describe('latestEvalGate', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'evals-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns the newest result that has a gate, ignoring older files without one', () => {
    const write = (name: string, body: unknown, secondsAgo: number) => {
      writeFileSync(join(root, name), JSON.stringify(body));
      const at = new Date(Date.now() - secondsAgo * 1_000);
      utimesSync(join(root, name), at, at);
    };
    write('old.json', { gate: { passed: true } }, 300);
    write('newest-no-gate.json', { passed: 3 }, 10);
    write('failed.json', { gate: { passed: false } }, 60);
    expect(latestEvalGate(root)).toEqual({ file: 'failed.json', passed: false });
    expect(latestEvalGate(join(root, 'missing'))).toBeNull();
  });
});

describe('telemetry', () => {
  it('classifies outcomes', () => {
    expect(outcomeOf(new ToolReportedError('MCP verify_order: không tìm thấy'))).toBe('tool_error');
    expect(outcomeOf(new Error('Request timed out.'))).toBe('timeout');
    expect(outcomeOf(new Error('connect ECONNREFUSED'))).toBe('failed');
    const controller = new AbortController();
    controller.abort();
    expect(outcomeOf(new Error('This operation was aborted'), controller.signal)).toBe('aborted');
  });

  it('records one redacted log line per call and rethrows the original error', async () => {
    await expect(trackDependency('mcp_builtin', 'verify_order', 'trace-1', async () => 'ok')).resolves.toBe('ok');
    const failure = new Error('Số 0912 345 678 không khớp');
    await expect(trackDependency('mcp_builtin', 'verify_order', 'trace-2', async () => { throw failure; })).rejects.toBe(failure);
    const logged = captured.lines.map((line) => JSON.parse(line));
    expect(logged).toEqual([
      expect.objectContaining({ stage: 'dependency.call', dependency: 'mcp_builtin', operation: 'verify_order', outcome: 'ok', trace_id: 'trace-1' }),
      expect.objectContaining({ stage: 'dependency.call', outcome: 'failed', error: 'Số [phone] không khớp' }),
    ]);
  });
});

describe('GET /api/metrics', () => {
  const initial = env.METRICS_TOKEN;
  afterEach(() => { env.METRICS_TOKEN = initial; });
  const token = 'metrics-token-with-at-least-24-chars';
  const request = (authorization?: string) => new Request('http://localhost/api/metrics', { headers: authorization ? { authorization } : {} });

  it('does not exist without a configured token', async () => {
    env.METRICS_TOKEN = undefined;
    expect((await metricsRoute(request(`Bearer ${token}`))).status).toBe(404);
  });

  it('requires the exact bearer token', async () => {
    env.METRICS_TOKEN = token;
    expect((await metricsRoute(request())).status).toBe(401);
    expect((await metricsRoute(request('Bearer wrong-token-of-sufficient-length'))).status).toBe(401);
  });

  it('serves Prometheus text even when the database is down, with no IDs in labels', async () => {
    env.METRICS_TOKEN = token;
    metrics.dependencyCall.observe({ dependency: 'mcp_builtin', operation: 'verify_order', outcome: 'ok' }, 0.04);
    const response = await metricsRoute(request(`Bearer ${token}`));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('fashion_dependency_call_duration_seconds_bucket{le="0.05",dependency="mcp_builtin",operation="verify_order",outcome="ok"}');
    expect(body).toContain('fashion_approval_pending');
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
