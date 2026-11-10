import { DAY_MS, readLogLines } from '@/features/monitoring/summary';
import { env } from '@/lib/env';
import { safeError } from '@/lib/redact';

export type McpHealth = { healthy: boolean; latencyMs: number; error: string | null };

/** GET /health of the built-in MCP server (no token needed, returns no tool list). Never throws. */
export async function builtinMcpHealth(timeoutMs = 3_000): Promise<McpHealth> {
  const startedAt = Date.now();
  try {
    const url = new URL(env.MCP_URL);
    url.pathname = '/health';
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    return { healthy: response.ok, latencyMs: Date.now() - startedAt, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { healthy: false, latencyMs: Date.now() - startedAt, error: safeError(error) };
  }
}

export type BuiltinMcpActivity = { calls: number; failures: number; lastFailure: { at: string; operation: string; error: string | null } | null };

/** Built-in MCP calls seen by web/worker in the last 24 hours (error texts were redacted when logged). */
export function builtinMcpActivity(): BuiltinMcpActivity {
  const calls = readLogLines(DAY_MS).filter((line) => line.stage === 'dependency.call' && line.dependency === 'mcp_builtin' && line.outcome !== 'aborted');
  const failures = calls.filter((line) => line.outcome === 'failed' || line.outcome === 'timeout');
  const last = failures.reduce<(typeof failures)[number] | undefined>((latest, line) => (!latest || (line.time ?? 0) > (latest.time ?? 0) ? line : latest), undefined);
  return {
    calls: calls.length,
    failures: failures.length,
    lastFailure: last ? { at: new Date(last.time ?? 0).toISOString(), operation: last.operation ?? '', error: last.error ?? null } : null,
  };
}
