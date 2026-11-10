import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The fields Monitoring reads from a log line. Only numbers, names and outcomes: never text a customer wrote. */
export type LogLine = {
  time?: number; stage?: string; latencyMs?: number; sourceIds?: string[]; validation?: string; route?: string; outcome?: string; kind?: string;
  dependency?: string; operation?: string; error?: string; usage?: { inputTokens?: number; outputTokens?: number }; embeddingTokens?: number;
};

export type DependencyStats = { dependency: string; operation: string; calls: number; p95Ms: number | null; failures: number; toolErrors: number; failureRate: number };

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const FAILED = new Set(['failed', 'timeout']);
const REJECTED_ANSWER = new Set(['invalid_citation', 'missing_citation', 'unsupported_number']);

/** Pure aggregation over parsed log lines (unit-tested); `monitoringSummary` feeds it from the NDJSON files. */
export function summarize(lines: LogLine[]) {
  const retrieval: number[] = [];
  const chat: number[] = [];
  const modelLatencies: number[] = [];
  const dependencies = new Map<string, { dependency: string; operation: string; latencies: number[]; failures: number; toolErrors: number }>();
  let emptyRetrievals = 0, chatFailed = 0, citationRejected = 0, reviewRequired = 0, guardBlocked = 0, answers = 0, limitAnswers = 0;
  let rateLimitAllowed = 0, rateLimitRejected = 0, inputTokens = 0, outputTokens = 0, embeddingTokens = 0;

  for (const item of lines) {
    switch (item.stage) {
      case 'retrieval': if (isNumber(item.latencyMs)) retrieval.push(item.latencyMs); if (!item.sourceIds?.length) emptyRetrievals += 1; break;
      case 'chat.completed': if (isNumber(item.latencyMs)) chat.push(item.latencyMs); break;
      case 'chat.failed': chatFailed += 1; break;
      case 'agent.completed': answers += 1; if (item.route === 'limit') limitAnswers += 1; if (REJECTED_ANSWER.has(item.validation ?? '')) citationRejected += 1; break;
      case 'ingestion.review_required': reviewRequired += 1; break;
      case 'guardrail.prompt_injection': guardBlocked += 1; break;
      case 'rate_limit': if (item.outcome === 'rejected') rateLimitRejected += 1; else rateLimitAllowed += 1; break;
      case 'dependency.call': {
        if (item.outcome === 'aborted' || !item.dependency || !item.operation) break;
        const key = `${item.dependency}\u0000${item.operation}`;
        const entry = dependencies.get(key) ?? { dependency: item.dependency, operation: item.operation, latencies: [], failures: 0, toolErrors: 0 };
        if (isNumber(item.latencyMs)) { entry.latencies.push(item.latencyMs); if (item.dependency === 'openai' && item.operation !== 'embedding') modelLatencies.push(item.latencyMs); }
        if (FAILED.has(item.outcome ?? '')) entry.failures += 1;
        if (item.outcome === 'tool_error') entry.toolErrors += 1;
        dependencies.set(key, entry);
        break;
      }
    }
    inputTokens += item.usage?.inputTokens ?? 0;
    outputTokens += item.usage?.outputTokens ?? 0;
    embeddingTokens += item.embeddingTokens ?? 0;
  }

  const byDependency: DependencyStats[] = [...dependencies.values()]
    .map((entry) => ({ dependency: entry.dependency, operation: entry.operation, calls: entry.latencies.length, p95Ms: percentile(entry.latencies, 0.95), failures: entry.failures, toolErrors: entry.toolErrors, failureRate: entry.latencies.length ? entry.failures / entry.latencies.length : 0 }))
    .sort((a, b) => a.dependency.localeCompare(b.dependency) || b.calls - a.calls);
  const chatModel = byDependency.filter((entry) => entry.dependency === 'openai' && entry.operation !== 'embedding');
  const totalOf = (dependency?: string) => byDependency.filter((entry) => !dependency || entry.dependency === dependency).reduce((sum, entry) => ({ calls: sum.calls + entry.calls, failures: sum.failures + entry.failures }), { calls: 0, failures: 0 });

  return {
    retrieval: { count: retrieval.length, p95Ms: percentile(retrieval, 0.95), emptyRate: retrieval.length ? emptyRetrievals / retrieval.length : null },
    chat: { count: chat.length, p95Ms: percentile(chat, 0.95), failed: chatFailed },
    // Chat-model calls only; embeddings are listed in `dependencies` under operation "embedding".
    model: { calls: chatModel.reduce((sum, entry) => sum + entry.calls, 0), failures: chatModel.reduce((sum, entry) => sum + entry.failures, 0), p95Ms: percentile(modelLatencies, 0.95) },
    dependencies: byDependency,
    dependencyCalls: totalOf().calls,
    dependencyFailures: totalOf().failures,
    answers,
    limitAnswers,
    guardBlocked,
    citationRejected,
    reviewRequired,
    rateLimit: { allowed: rateLimitAllowed, rejected: rateLimitRejected },
    tokens: { input: inputTokens, output: outputTokens, embedding: embeddingTokens },
  };
}

export type MonitoringSummary = ReturnType<typeof summarize>;

const MAX_LINES_PER_FILE = 20_000;

/** Parsed lines of the local rotating logs (web, worker, mcp) newer than `windowMs`. Broken lines are skipped. */
export function readLogLines(windowMs: number, root = join(process.cwd(), 'data', 'logs')): LogLine[] {
  if (!existsSync(root)) return [];
  const since = Date.now() - windowMs;
  const lines: LogLine[] = [];
  for (const name of readdirSync(root).filter((file) => /^(web|worker|mcp)\.ndjson(?:\.\d+)?$/.test(file))) {
    for (const raw of readFileSync(join(root, name), 'utf8').trim().split('\n').slice(-MAX_LINES_PER_FILE)) {
      try {
        const item = JSON.parse(raw) as LogLine;
        if (!isNumber(item.time) || item.time >= since) lines.push(item);
      } catch { /* a partial line while the file is being written */ }
    }
  }
  return lines;
}

export const DAY_MS = 24 * 60 * 60 * 1_000;

/** Aggregates only safe numeric fields from local rotating NDJSON logs for the Admin dashboard. */
export function monitoringSummary(windowMs = DAY_MS) {
  return summarize(readLogLines(windowMs));
}
