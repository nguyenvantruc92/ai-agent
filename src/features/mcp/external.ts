import { serverForCall, withMcpClient } from '@/features/mcp/servers';
import { validateToolArgs } from '@/features/mcp/validate';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { breakerFor, CircuitOpenError } from '@/lib/resilience';
import { outcomeOf, recordDependencyCall } from '@/lib/telemetry';

/** What a tool of an external MCP server returned, reduced to text the model can read. */
export type ExternalResult = { text: string; isError: boolean; truncated: boolean };

/** Per-result cap on what reaches the model (separate from the transport's byte cap). */
const MAX_TEXT_CHARS = 8_000;

type Content = { type: string; text?: string; resource?: { text?: string; uri?: string } };

function toText(result: { content?: Content[]; structuredContent?: unknown }) {
  const parts = (result.content ?? []).map((part) => {
    if (part.type === 'text') return part.text ?? '';
    if (part.type === 'resource') return part.resource?.text ?? `[tài nguyên ${part.resource?.uri ?? ''}]`;
    return `[nội dung ${part.type} không đọc được dưới dạng văn bản]`;
  }).filter(Boolean);
  if (!parts.length && result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  return parts.join('\n');
}

/**
 * Calls one tool on an external MCP server. The arguments are validated against the schema the server published, the
 * connection goes through the SSRF-guarded fetch, and the server's credentials are decrypted only for this call. The
 * model's arguments are passed as given: external tools never receive the thread or customer identity.
 */
export async function callExternalTool(serverId: string, toolName: string, args: Record<string, unknown>, inputSchema: unknown, traceId: string): Promise<ExternalResult> {
  const invalid = validateToolArgs(inputSchema, args);
  if (invalid) throw new HttpError(invalid, 400);
  const server = await serverForCall(serverId);
  const startedAt = Date.now();
  try {
    // One breaker per external server; external tools are never retried (they may write).
    const result = await breakerFor(`mcp:${server.slug}`).run(() => withMcpClient(server, (client) => client.callTool({ name: toolName, arguments: args }, undefined, { timeout: env.MCP_TOOL_TIMEOUT_MS })));
    const text = toText(result as { content?: Content[]; structuredContent?: unknown });
    recordDependencyCall({ traceId, dependency: 'mcp_external', operation: `${server.slug}.${toolName}`, outcome: result.isError ? 'tool_error' : 'ok', latencyMs: Date.now() - startedAt });
    return { text: text.slice(0, MAX_TEXT_CHARS), isError: Boolean(result.isError), truncated: text.length > MAX_TEXT_CHARS };
  } catch (error) {
    if (error instanceof CircuitOpenError) throw new HttpError(`MCP server ${server.name} tạm thời không khả dụng (nhiều lỗi liên tiếp). Thử lại sau ít phút.`, 503);
    recordDependencyCall({ traceId, dependency: 'mcp_external', operation: `${server.slug}.${toolName}`, outcome: outcomeOf(error), latencyMs: Date.now() - startedAt, error });
    throw error instanceof HttpError ? error : new HttpError('Không gọi được tool của MCP server ngoài (lỗi kết nối hoặc server từ chối).', 502);
  }
}
