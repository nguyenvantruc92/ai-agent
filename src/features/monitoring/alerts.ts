import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '@/db/client';
import { operationalBacklog, type Backlog } from '@/features/monitoring/backlog';
import { builtinMcpHealth, type McpHealth } from '@/features/monitoring/mcp-health';
import { readLogLines, summarize, type MonitoringSummary } from '@/features/monitoring/summary';
import { env } from '@/lib/env';
import { workerLogger } from '@/lib/logger';
import { safeError } from '@/lib/redact';

export type AlertCandidate = { key: string; severity: 'warning' | 'critical'; message: string; value: number | null; threshold: number | null; dedupeMinutes?: number };
export type AlertThresholds = { minSamples: number; dependencyFailureRate: number; chatP95Ms: number; approvalMaxAgeMinutes: number; windowMinutes: number };
export type EvalGateStatus = { file: string; passed: boolean } | null;
export type AlertInput = { summary: MonitoringSummary; backlog: Backlog; mcp: McpHealth; latestEval: EvalGateStatus };

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

/** Pure rules (unit-tested). Messages contain numbers and names an admin controls, never customer data. */
export function evaluateAlerts({ summary, backlog, mcp, latestEval }: AlertInput, t: AlertThresholds): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const window = `${t.windowMinutes} phút`;
  if (!mcp.healthy) alerts.push({ key: 'mcp_builtin_down', severity: 'critical', message: `MCP nội bộ không phản hồi /health (${mcp.error ?? 'lỗi không rõ'}).`, value: null, threshold: null });

  const byDependency = new Map<string, { calls: number; failures: number }>();
  for (const entry of summary.dependencies) {
    const total = byDependency.get(entry.dependency) ?? { calls: 0, failures: 0 };
    byDependency.set(entry.dependency, { calls: total.calls + entry.calls, failures: total.failures + entry.failures });
  }
  for (const [dependency, { calls, failures }] of byDependency) {
    const rate = calls ? failures / calls : 0;
    if (calls >= t.minSamples && rate >= t.dependencyFailureRate) {
      alerts.push({ key: `dependency_failure:${dependency}`, severity: 'critical', message: `${dependency}: ${failures}/${calls} lần gọi lỗi hoặc timeout trong ${window} (${pct(rate)} ≥ ${pct(t.dependencyFailureRate)}).`, value: rate, threshold: t.dependencyFailureRate });
    }
  }
  if (summary.chat.count >= t.minSamples && summary.chat.p95Ms !== null && summary.chat.p95Ms > t.chatP95Ms) {
    alerts.push({ key: 'chat_p95', severity: 'warning', message: `Chat p95 ${summary.chat.p95Ms} ms > ${t.chatP95Ms} ms trong ${window} (${summary.chat.count} lượt).`, value: summary.chat.p95Ms, threshold: t.chatP95Ms });
  }
  const oldestMinutes = backlog.approvalOldestSeconds === null ? null : Math.floor(backlog.approvalOldestSeconds / 60);
  if (oldestMinutes !== null && oldestMinutes > t.approvalMaxAgeMinutes) {
    alerts.push({ key: 'approval_backlog', severity: 'warning', message: `${backlog.approvalsPending} yêu cầu chờ duyệt; yêu cầu cũ nhất đã chờ ${oldestMinutes} phút (> ${t.approvalMaxAgeMinutes}).`, value: oldestMinutes, threshold: t.approvalMaxAgeMinutes });
  }
  if (backlog.ingestionFailed24h > 0) {
    alerts.push({ key: 'ingestion_failed', severity: 'warning', message: `${backlog.ingestionFailed24h} job index tài liệu lỗi trong 24 giờ qua.`, value: backlog.ingestionFailed24h, threshold: 0, dedupeMinutes: 24 * 60 });
  }
  if (latestEval && !latestEval.passed) {
    // Keyed by file: one notification per failed run, however long it stays the latest.
    alerts.push({ key: `eval_gate_failed:${latestEval.file}`, severity: 'critical', message: `Eval gate gần nhất FAIL (${latestEval.file}).`, value: null, threshold: null, dedupeMinutes: 30 * 24 * 60 });
  }
  return alerts;
}

/** Newest file in data/eval-results that carries a gate result (older runs without one are ignored). */
export function latestEvalGate(root = join(process.cwd(), 'data', 'eval-results')): EvalGateStatus {
  if (!existsSync(root)) return null;
  const files = readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => ({ name, mtime: statSync(join(root, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  for (const { name } of files.slice(0, 5)) {
    try {
      const gate = (JSON.parse(readFileSync(join(root, name), 'utf8')) as { gate?: { passed?: boolean } }).gate;
      if (typeof gate?.passed === 'boolean') return { file: name, passed: gate.passed };
    } catch { /* being written */ }
  }
  return null;
}

const thresholds = (): AlertThresholds => ({
  minSamples: env.ALERT_MIN_SAMPLES, dependencyFailureRate: env.ALERT_DEPENDENCY_FAILURE_RATE, chatP95Ms: env.ALERT_CHAT_P95_MS,
  approvalMaxAgeMinutes: env.ALERT_APPROVAL_MAX_AGE_MINUTES, windowMinutes: env.ALERT_WINDOW_MINUTES,
});

async function notify(alert: AlertCandidate) {
  if (!env.ALERT_WEBHOOK_URL) return false;
  const text = `[Fashion Tomodev · ${alert.severity}] ${alert.message}`;
  try {
    // `text` for Slack, `content` for Discord; both are plain numbers/names.
    const response = await fetch(env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    workerLogger.warn({ stage: 'alert.notify_failed', alert: alert.key, error: safeError(error) });
    return false;
  }
}

/** Records the alert unless the same key fired within its de-duplication window; returns whether it was new. */
async function fire(alert: AlertCandidate) {
  const minutes = alert.dedupeMinutes ?? env.ALERT_DEDUPE_MINUTES;
  const id = randomUUID();
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO alert_events (id, alert_key, severity, message, value, threshold)
    SELECT ${id}, ${alert.key}, ${alert.severity}, ${alert.message}, ${alert.value}, ${alert.threshold}
    WHERE NOT EXISTS (SELECT 1 FROM alert_events WHERE alert_key = ${alert.key} AND fired_at > now() - ${`${minutes} minutes`}::interval)
    RETURNING id
  `;
  if (!inserted.length) return false;
  workerLogger.warn({ stage: 'alert.fired', alert: alert.key, severity: alert.severity, value: alert.value, threshold: alert.threshold });
  if (await notify(alert)) await sql`UPDATE alert_events SET notified = true WHERE id = ${id}`;
  return true;
}

/** Worker job: gathers the inputs, evaluates the rules and fires new alerts. Telemetry gaps never throw out of here. */
export async function runAlertChecks() {
  const t = thresholds();
  const [backlog, mcp] = await Promise.all([operationalBacklog(), builtinMcpHealth()]);
  const input: AlertInput = { summary: summarize(readLogLines(t.windowMinutes * 60_000)), backlog, mcp, latestEval: latestEvalGate() };
  let fired = 0;
  for (const alert of evaluateAlerts(input, t)) if (await fire(alert)) fired += 1;
  await sql`DELETE FROM alert_events WHERE fired_at < now() - interval '30 days'`;
  return fired;
}

export type AlertEvent = { id: string; alert_key: string; severity: 'warning' | 'critical'; message: string; notified: boolean; fired_at: Date };

export async function recentAlerts(limit = 20) {
  return sql<AlertEvent[]>`SELECT id, alert_key, severity, message, notified, fired_at FROM alert_events ORDER BY fired_at DESC LIMIT ${limit}`;
}
