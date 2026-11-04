import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { sql } from '@/db/client';
import { builtinToolNames } from '@/features/agent/tools';
import { invalidateAgentCache } from '@/features/ai/agents';
import { ensureAiDefaults } from '@/features/ai/seed';
import { assertSafeUrl, guardedFetch } from '@/features/mcp/ssrf';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { logger } from '@/lib/logger';
import { decryptSecret, encryptSecret } from '@/lib/secrets';

// ───────────── Schemas ─────────────

const forbiddenHeaders = new Set(['host', 'content-length', 'content-type', 'accept', 'transfer-encoding', 'connection', 'upgrade', 'mcp-session-id', 'mcp-protocol-version', 'accept-encoding', 'cookie']);

const connectionFields = {
  url: z.string().trim().min(8, 'Nhập URL của MCP server.').max(500),
  authType: z.enum(['none', 'bearer', 'header']).default('none'),
  authHeaderName: z.string().trim().max(60).optional(),
  /** New secret. Omitted/empty keeps the stored one (when the auth type is unchanged). */
  authSecret: z.string().max(2000).optional(),
};

function checkAuth(value: { authType: string; authHeaderName?: string; authSecret?: string }, ctx: z.RefinementCtx) {
  if (value.authType === 'header') {
    if (!value.authHeaderName) ctx.addIssue({ code: 'custom', path: ['authHeaderName'], message: 'Nhập tên header.' });
    else if (!/^[A-Za-z0-9-]{1,60}$/.test(value.authHeaderName) || forbiddenHeaders.has(value.authHeaderName.toLowerCase())) ctx.addIssue({ code: 'custom', path: ['authHeaderName'], message: 'Tên header không hợp lệ hoặc bị hệ thống dành riêng.' });
  }
  if (value.authSecret && /[\r\n]/.test(value.authSecret)) ctx.addIssue({ code: 'custom', path: ['authSecret'], message: 'Giá trị xác thực không được chứa xuống dòng.' });
}

/** A tool ticked on the server: agents that use the server get it; `requiresApproval` makes staff approve each call (external servers only). */
export const selectedToolInput = z.object({ name: z.string().trim().min(1).max(200), requiresApproval: z.boolean().default(false) });
export type SelectedTool = z.infer<typeof selectedToolInput>;

export const serverInput = z.object({
  name: z.string().trim().min(2, 'Tên cần ít nhất 2 ký tự.').max(80, 'Tên tối đa 80 ký tự.'),
  slug: z.string().trim().regex(/^[a-z][a-z0-9_]{1,30}$/, 'Mã (slug) gồm chữ thường, số, dấu gạch dưới; bắt đầu bằng chữ; 2–31 ký tự.').refine((value) => !value.includes('__'), 'Mã không được chứa hai dấu gạch dưới liên tiếp.'),
  ...connectionFields,
  selectedTools: z.array(selectedToolInput).max(100).default([]),
}).superRefine(checkAuth);
export type ServerInput = z.infer<typeof serverInput>;

/** What "Lấy danh sách tool" sends: the connection settings as typed, plus the saved server's id so an empty secret keeps the stored one. */
export const discoverInput = z.object({ ...connectionFields, serverId: z.string().uuid().optional() }).superRefine(checkAuth);
export type DiscoverInput = z.infer<typeof discoverInput>;

// ───────────── Rows ─────────────

export type McpToolInfo = { name: string; description: string; readOnly: boolean | null; destructive: boolean | null; inputSchema: unknown };
type ServerRow = {
  id: string; name: string; slug: string; url: string; auth_type: 'none' | 'bearer' | 'header'; auth_header_name: string | null;
  auth_secret_encrypted: string | null; auth_hint: string | null; is_builtin: boolean; enabled: boolean; selected_tools: SelectedTool[];
  last_checked_at: string | null; last_status: 'ok' | 'error' | null; last_error: string | null; tools_cache: McpToolInfo[]; created_at: string; updated_at: string;
};
/** What the API returns: never the secret, only whether one exists and its last characters. */
export type ServerView = Omit<ServerRow, 'auth_secret_encrypted'> & { has_secret: boolean; agents: { id: string; name: string }[] };

const view = ({ auth_secret_encrypted, ...row }: ServerRow, agents: { id: string; name: string }[]): ServerView => ({ ...row, has_secret: Boolean(auth_secret_encrypted), agents });

async function agentsUsing(serverId: string) {
  return sql<{ id: string; name: string }[]>`
    SELECT DISTINCT a.id, a.name FROM agent_mcp_servers m JOIN ai_agents a ON a.id = m.agent_id WHERE m.mcp_server_id = ${serverId} AND a.archived_at IS NULL ORDER BY a.name
  `;
}

export async function listServers(): Promise<ServerView[]> {
  await ensureAiDefaults();
  const rows = await sql<ServerRow[]>`SELECT * FROM mcp_servers ORDER BY is_builtin DESC, name`;
  return Promise.all(rows.map(async (row) => view(row, await agentsUsing(row.id))));
}

async function row(id: string): Promise<ServerRow> {
  const [server] = await sql<ServerRow[]>`SELECT * FROM mcp_servers WHERE id = ${id}`;
  if (!server) throw new HttpError('Không tìm thấy MCP server.', 404);
  return server;
}

/** The server row for a tool call: external, enabled servers only. */
export async function serverForCall(id: string) {
  const server = await row(id);
  if (server.is_builtin) throw new HttpError('Tool của server có sẵn không gọi theo đường này.', 400);
  if (!server.enabled) throw new HttpError(`MCP server “${server.name}” đang tắt.`, 409);
  return server;
}

export async function getServer(id: string) {
  const server = await row(id);
  return view(server, await agentsUsing(id));
}

// ───────────── Writes ─────────────

type AuthColumns = { type: 'none' | 'bearer' | 'header'; header: string | null; secret: string | null; hint: string | null };

function authColumns(input: { authType: 'none' | 'bearer' | 'header'; authHeaderName?: string; authSecret?: string }, current?: ServerRow): AuthColumns {
  if (input.authType === 'none') return { type: 'none', header: null, secret: null, hint: null };
  const header = input.authType === 'header' ? input.authHeaderName! : null;
  if (input.authSecret) return { type: input.authType, header, secret: encryptSecret(input.authSecret), hint: input.authSecret.slice(-4) };
  if (current && current.auth_type === input.authType && current.auth_secret_encrypted) return { type: input.authType, header, secret: current.auth_secret_encrypted, hint: current.auth_hint };
  throw new HttpError('Nhập giá trị xác thực (token hoặc giá trị header).', 400);
}

/**
 * Connects with the settings as typed (not yet saved) and lists the server's tools, so an admin can tick the ones to use before
 * saving. For a saved server, an empty secret reuses the stored one. The built-in server has no connection to try: its tools come from code.
 */
export async function discoverTools(input: DiscoverInput): Promise<{ ok: true; tools: McpToolInfo[] } | { ok: false; message: string }> {
  try {
    const url = await assertSafeUrl(input.url);
    let current: ServerRow | undefined;
    if (input.serverId) {
      current = await row(input.serverId);
      if (current.is_builtin) throw new HttpError('MCP server có sẵn của hệ thống không có kết nối để lấy tool.', 400);
    }
    const auth = authColumns(input, current);
    return { ok: true, tools: await fetchTools({ url: url.toString(), auth_type: auth.type, auth_header_name: auth.header, auth_secret_encrypted: auth.secret }) };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw error;
    return { ok: false, message: connectionError(error) };
  }
}

/** Ticked tools must exist on the server right now; the fresh list is what gets cached with the selection. */
async function verifiedSelection(connection: DiscoverInput, selected: SelectedTool[]): Promise<{ tools: McpToolInfo[]; selected: SelectedTool[] } | undefined> {
  const unique = [...new Map(selected.map((tool) => [tool.name, tool])).values()];
  if (!unique.length) return undefined;
  const result = await discoverTools(connection);
  if (!result.ok) throw new HttpError(`Không lấy được danh sách tool để lưu lựa chọn: ${result.message}`, 400);
  const listed = new Set(result.tools.map((tool) => tool.name));
  const missing = unique.filter((tool) => !listed.has(tool.name)).map((tool) => tool.name);
  if (missing.length) throw new HttpError(`MCP server không còn tool: ${missing.join(', ')}. Bấm “Lấy danh sách tool” để làm mới rồi chọn lại.`, 400);
  return { tools: result.tools, selected: unique };
}

export async function createServer(input: ServerInput) {
  const url = await assertSafeUrl(input.url);
  const auth = authColumns(input);
  const checked = await verifiedSelection({ ...input, url: url.toString() }, input.selectedTools);
  const id = randomUUID();
  await sql`
    INSERT INTO mcp_servers (id, name, slug, url, auth_type, auth_header_name, auth_secret_encrypted, auth_hint, selected_tools, tools_cache, last_status, last_checked_at)
    VALUES (${id}, ${input.name}, ${input.slug}, ${url.toString()}, ${auth.type}, ${auth.header}, ${auth.secret}, ${auth.hint}, ${sql.json((checked?.selected ?? []) as never)},
      ${sql.json((checked?.tools ?? []) as never)}, ${checked ? 'ok' : null}, ${checked ? new Date() : null})
  `;
  return id;
}

export async function updateServer(id: string, input: ServerInput) {
  const current = await row(id);
  if (current.is_builtin) throw new HttpError('MCP server có sẵn của hệ thống chỉ chọn được tool (không sửa tên, địa chỉ hay xác thực).', 403);
  const url = await assertSafeUrl(input.url);
  const auth = authColumns(input, current);
  const checked = await verifiedSelection({ ...input, url: url.toString(), serverId: id }, input.selectedTools);
  // A changed address or credential invalidates what we learned about the server (unless the tool list was just refreshed).
  const changed = url.toString() !== current.url || auth.secret !== current.auth_secret_encrypted;
  const selected = checked?.selected ?? [];
  const tools = checked?.tools ?? (changed ? [] : current.tools_cache);
  await sql`
    UPDATE mcp_servers SET name = ${input.name}, slug = ${input.slug}, url = ${url.toString()}, auth_type = ${auth.type}, auth_header_name = ${auth.header},
      auth_secret_encrypted = ${auth.secret}, auth_hint = ${auth.hint}, selected_tools = ${sql.json(selected as never)}, tools_cache = ${sql.json(tools as never)}, updated_at = now(),
      last_status = ${checked ? 'ok' : changed ? null : current.last_status}, last_error = ${checked || changed ? null : current.last_error},
      last_checked_at = ${checked ? new Date() : changed ? null : current.last_checked_at}
    WHERE id = ${id}
  `;
  invalidateAgentCache();
}

/** The built-in server: only its set of ticked tools can change. How each tool runs (confirmation, approval) is fixed in code. */
export async function setBuiltinSelectedTools(id: string, selected: SelectedTool[]) {
  const current = await row(id);
  if (!current.is_builtin) throw new HttpError('Chỉ áp dụng cho MCP server có sẵn.', 400);
  const known: readonly string[] = builtinToolNames;
  const unknown = selected.filter((tool) => !known.includes(tool.name));
  if (unknown.length) throw new HttpError(`Tool không tồn tại: ${unknown.map((tool) => tool.name).join(', ')}.`, 400);
  const unique = [...new Set(selected.map((tool) => tool.name))].map((name) => ({ name, requiresApproval: false }));
  await sql`UPDATE mcp_servers SET selected_tools = ${sql.json(unique as never)}, updated_at = now() WHERE id = ${id}`;
  invalidateAgentCache();
}

export async function setServerEnabled(id: string, enabled: boolean) {
  const current = await row(id);
  if (current.is_builtin && !enabled) throw new HttpError('MCP server có sẵn của hệ thống không tắt được.', 403);
  await sql`UPDATE mcp_servers SET enabled = ${enabled}, updated_at = now() WHERE id = ${id}`;
  invalidateAgentCache();
  return { warnAgents: enabled ? [] : await agentsUsing(id) };
}

/** Refuses while an agent uses the server and names those agents; the built-in server can never be deleted. */
export async function deleteServer(id: string) {
  const current = await row(id);
  if (current.is_builtin) throw new HttpError('MCP server có sẵn của hệ thống không xóa được.', 403);
  const agents = await agentsUsing(id);
  if (agents.length) throw new HttpError(`MCP server đang được dùng bởi Agent: ${agents.map((agent) => agent.name).join(', ')}. Gỡ tool của server khỏi Agent trước khi xóa.`, 409);
  await sql`DELETE FROM mcp_servers WHERE id = ${id}`;
}

// ───────────── Connecting ─────────────

/** Auth headers for a stored server; decrypted only here, at call time. */
export function authHeaders(server: Pick<ServerRow, 'auth_type' | 'auth_header_name' | 'auth_secret_encrypted'>): Record<string, string> {
  if (server.auth_type === 'none' || !server.auth_secret_encrypted) return {};
  const secret = decryptSecret(server.auth_secret_encrypted);
  return server.auth_type === 'bearer' ? { authorization: `Bearer ${secret}` } : { [server.auth_header_name!]: secret };
}

/** Runs `use` against an MCP server through the guarded fetch; always closes the connection. */
export async function withMcpClient<T>(server: Pick<ServerRow, 'url' | 'auth_type' | 'auth_header_name' | 'auth_secret_encrypted'>, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: 'fashion-tomodev-admin', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    fetch: guardedFetch(),
    requestInit: { headers: authHeaders(server) },
    redirectPolicy: 'same-origin',
  });
  try {
    await client.connect(transport, { timeout: env.MCP_TOOL_TIMEOUT_MS });
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

const MAX_TOOLS = 100;
const MAX_SCHEMA_CHARS = 20_000;

function toToolInfo(tool: { name: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }): McpToolInfo {
  const schema = JSON.stringify(tool.inputSchema ?? {});
  return {
    name: tool.name,
    description: (tool.description ?? '').slice(0, 1000),
    readOnly: tool.annotations?.readOnlyHint ?? null,
    destructive: tool.annotations?.destructiveHint ?? null,
    inputSchema: schema.length <= MAX_SCHEMA_CHARS ? tool.inputSchema ?? {} : { omitted: 'Schema quá lớn' },
  };
}

/** Plain-language reason for a failed connection (no stack traces or internal details). */
export function connectionError(error: unknown) {
  if (error instanceof HttpError) return error.message;
  // The SDK keeps the HTTP status in `code` and may leave it out of the message (an empty 401 body, for example).
  const status = (error as { code?: unknown } | null)?.code;
  if (status === 401 || status === 403 || (error as Error | null)?.name === 'UnauthorizedError') return 'MCP server từ chối xác thực (kiểm tra token/header).';
  if (status === 404) return 'Không tìm thấy endpoint MCP (kiểm tra đường dẫn URL, thường kết thúc bằng /mcp).';
  const message = error instanceof Error ? `${error.message} ${(error.cause as Error | undefined)?.message ?? ''}` : String(error);
  if (/ECONNREFUSED/.test(message)) return 'Máy chủ từ chối kết nối (sai địa chỉ/cổng hoặc chưa chạy).';
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'Không tìm thấy tên miền của MCP server.';
  if (/timed? ?out|ETIMEDOUT|không phản hồi/i.test(message)) return 'MCP server không phản hồi kịp thời gian cho phép.';
  if (/401|403|unauthori[sz]ed|forbidden/i.test(message)) return 'MCP server từ chối xác thực (kiểm tra token/header).';
  if (/404/.test(message)) return 'Không tìm thấy endpoint MCP (kiểm tra đường dẫn URL, thường kết thúc bằng /mcp).';
  if (/certificate|SSL|TLS/i.test(message)) return 'Lỗi chứng chỉ TLS khi kết nối tới MCP server.';
  return 'Không kết nối được tới MCP server hoặc phản hồi không đúng chuẩn MCP.';
}

/** Lists a server's tools (capped, descriptions and oversized schemas trimmed). */
export async function fetchTools(server: Pick<ServerRow, 'url' | 'auth_type' | 'auth_header_name' | 'auth_secret_encrypted'>): Promise<McpToolInfo[]> {
  return withMcpClient(server, async (client) => (await client.listTools(undefined, { timeout: env.MCP_TOOL_TIMEOUT_MS })).tools.slice(0, MAX_TOOLS).map(toToolInfo));
}

/** Connects, lists the tools and stores the result (and the outcome) on the server row. The ticked tools are left as they are. */
export async function testServer(id: string) {
  const server = await row(id);
  try {
    const tools = await fetchTools(server);
    await sql`UPDATE mcp_servers SET last_status = 'ok', last_error = NULL, last_checked_at = now(), tools_cache = ${sql.json(tools as never)}, updated_at = now() WHERE id = ${id}`;
    invalidateAgentCache();
    return { ok: true as const, tools };
  } catch (error) {
    const message = connectionError(error);
    logger.warn({ stage: 'mcp.test_failed', serverId: id, error: error instanceof Error ? error.message : String(error) });
    await sql`UPDATE mcp_servers SET last_status = 'error', last_error = ${message}, last_checked_at = now(), updated_at = now() WHERE id = ${id}`;
    return { ok: false as const, message };
  }
}
