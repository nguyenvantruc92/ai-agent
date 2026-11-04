import { serverForCall, withMcpClient } from '@/features/mcp/servers';
import { validateToolArgs } from '@/features/mcp/validate';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { logger } from '@/lib/logger';

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
    const result = await withMcpClient(server, (client) => client.callTool({ name: toolName, arguments: args }, undefined, { timeout: env.MCP_TOOL_TIMEOUT_MS }));
    const text = toText(result as { content?: Content[]; structuredContent?: unknown });
    logger.info({ trace_id: traceId, stage: 'mcp.external_tool', server: server.slug, tool: toolName, isError: Boolean(result.isError), chars: text.length, latencyMs: Date.now() - startedAt });
    return { text: text.slice(0, MAX_TEXT_CHARS), isError: Boolean(result.isError), truncated: text.length > MAX_TEXT_CHARS };
  } catch (error) {
    logger.warn({ trace_id: traceId, stage: 'mcp.external_tool_failed', server: server.slug, tool: toolName, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - startedAt });
    throw error instanceof HttpError ? error : new HttpError('Không gọi được tool của MCP server ngoài (lỗi kết nối hoặc server từ chối).', 502);
  }
}
