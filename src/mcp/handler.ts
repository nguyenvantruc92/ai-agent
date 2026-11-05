import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/logger';
import { safeError } from '@/lib/redact';

type Extra = { _meta?: Record<string, unknown> };

/**
 * Wraps a tool with JSON output and one trace line per call. The line never contains `args` (phone, thread and
 * confirmation IDs); a failure is logged redacted, while the model still gets the plain message to explain it.
 */
export function handler<A>(name: string, run: (args: A, traceId: string) => Promise<unknown>) {
  return async (args: A, extra: Extra) => {
    const traceId = typeof extra._meta?.traceId === 'string' ? extra._meta.traceId : randomUUID();
    const startedAt = Date.now();
    try {
      const result = await run(args, traceId);
      logger.info({ trace_id: traceId, stage: 'mcp.tool', tool: name, latencyMs: Date.now() - startedAt });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ trace_id: traceId, stage: 'mcp.tool_failed', tool: name, error: safeError(error), latencyMs: Date.now() - startedAt });
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
  };
}
