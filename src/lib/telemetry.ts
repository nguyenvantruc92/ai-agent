import { logger } from '@/lib/logger';
import { metrics, safely } from '@/lib/metrics';
import { safeError } from '@/lib/redact';

export type Dependency = 'openai' | 'mcp_builtin' | 'mcp_external';
/**
 * `tool_error`: the dependency answered and reported a business/tool error (order not found, invalid size…); it is
 * healthy. `aborted`: the customer left (request signal). `failed`/`timeout`: the dependency itself failed; only these
 * two count towards error-rate alerts.
 */
export type Outcome = 'ok' | 'tool_error' | 'failed' | 'timeout' | 'aborted';

/** Thrown for an MCP result with `isError: true`: the server answered, so this is not an outage. */
export class ToolReportedError extends Error {
  override name = 'ToolReportedError';
}

export function outcomeOf(error: unknown, signal?: AbortSignal): Outcome {
  if (error instanceof ToolReportedError) return 'tool_error';
  if (signal?.aborted) return 'aborted';
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /timeout|timed out|ETIMEDOUT|không phản hồi kịp/i.test(text) ? 'timeout' : 'failed';
}

type Call = { traceId: string; dependency: Dependency; operation: string; outcome: Outcome; latencyMs: number; error?: unknown };

/** One log line (stage `dependency.call`) and one histogram sample per call; the Monitoring page and alerts read both. */
export function recordDependencyCall({ traceId, dependency, operation, outcome, latencyMs, error }: Call) {
  const line = { trace_id: traceId, stage: 'dependency.call', dependency, operation, outcome, latencyMs, ...(error === undefined ? {} : { error: safeError(error) }) };
  if (outcome === 'failed' || outcome === 'timeout') logger.warn(line); else logger.info(line);
  safely(() => metrics.dependencyCall.observe({ dependency, operation, outcome }, latencyMs / 1_000));
}

/** Times `run`, records the call, and rethrows any error unchanged. */
export async function trackDependency<T>(dependency: Dependency, operation: string, traceId: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    recordDependencyCall({ traceId, dependency, operation, outcome: 'ok', latencyMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    recordDependencyCall({ traceId, dependency, operation, outcome: outcomeOf(error, signal), latencyMs: Date.now() - startedAt, error });
    throw error;
  }
}
