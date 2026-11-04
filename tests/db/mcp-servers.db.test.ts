import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('MCP server registry (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let servers: typeof import('@/features/mcp/servers');
  let external: typeof import('@/features/mcp/external');
  let seed: typeof import('@/features/ai/seed');
  let remote: Server;
  let base = '';
  let closedBase = '';
  const seen: { authorization?: string; apiKey?: string }[] = [];
  let mode: 'ok' | 'redirect' | 'bare401' | 'bare404' = 'ok';
  const requiredToken = 'secret-token-1234';

  /** A real MCP server (stateless Streamable HTTP) that insists on a bearer token or an x-api-key header. */
  function buildRemote() {
    const mcp = new McpServer({ name: 'remote', version: '1.0.0' });
    mcp.registerTool('get_weather', { description: 'Thời tiết theo thành phố', inputSchema: { city: z.string() }, annotations: { readOnlyHint: true } }, async ({ city }) => ({ content: [{ type: 'text', text: `Nắng ở ${city}` }] }));
    mcp.registerTool('big_text', { description: 'Văn bản rất dài', inputSchema: {} }, async () => ({ content: [{ type: 'text', text: 'x'.repeat(20_000) }] }));
    mcp.registerTool('always_fails', { description: 'Luôn lỗi', inputSchema: {} }, async () => ({ isError: true, content: [{ type: 'text', text: 'không có dữ liệu' }] }));
    mcp.registerTool('delete_everything', { description: 'Xóa dữ liệu', inputSchema: {}, annotations: { destructiveHint: true } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    return mcp;
  }
  const headerOf = (request: IncomingMessage, name: string) => String(request.headers[name] ?? '') || undefined;

  beforeAll(async () => {
    remote = createServer(async (request, response) => {
      seen.push({ authorization: headerOf(request, 'authorization'), apiKey: headerOf(request, 'x-api-key') });
      if (mode === 'redirect') { response.writeHead(302, { location: 'http://169.254.169.254/' }).end(); return; }
      if (mode === 'bare401') { response.writeHead(401).end(); return; }
      if (mode === 'bare404') { response.writeHead(404).end(); return; }
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      if (headerOf(request, 'authorization') !== `Bearer ${requiredToken}` && headerOf(request, 'x-api-key') !== requiredToken) { response.writeHead(401).end('unauthorized'); return; }
      const server = buildRemote();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      response.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(request, response);
    });
    await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', resolve));
    const port = (remote.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}/mcp`;
    // Loopback is blocked unless listed; env is read when the modules load, so set it first.
    // A port that was just freed: connecting is refused (not blocked), so the plain-language error can be checked.
    const spare = createServer();
    await new Promise<void>((resolve) => spare.listen(0, '127.0.0.1', resolve));
    const closedPort = (spare.address() as AddressInfo).port;
    await new Promise((resolve) => spare.close(resolve));
    closedBase = `http://127.0.0.1:${closedPort}/mcp`;
    process.env.MCP_ALLOWED_HOSTS = `127.0.0.1:${port},127.0.0.1:${closedPort}`;
    process.env.SETTINGS_ENCRYPTION_KEY = 'test-encryption-key-0123456789';
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    servers = await import('@/features/mcp/servers');
    external = await import('@/features/mcp/external');
    seed = await import('@/features/ai/seed');
  });
  afterAll(async () => { await sql?.end(); await new Promise((resolve) => remote.close(resolve)); });
  beforeEach(async () => {
    mode = 'ok'; seen.length = 0;
    await sql`TRUNCATE ai_agents, knowledge_scopes, mcp_servers, chat_threads CASCADE`;
    seed.resetAiSeedCache();
  });

  const input = (overrides: Record<string, unknown> = {}) => servers.serverInput.parse({ name: 'Thời tiết', slug: 'weather', url: base, authType: 'bearer', authSecret: requiredToken, ...overrides });

  describe('input validation', () => {
    it('validates slug, header names and auth fields', () => {
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'Bad Slug', url: 'http://x.example/mcp' }).success).toBe(false);
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'a__b', url: 'http://x.example/mcp' }).success).toBe(false);
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'ok', url: 'http://x.example/mcp', authType: 'header' }).success).toBe(false);
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'ok', url: 'http://x.example/mcp', authType: 'header', authHeaderName: 'Host' }).success).toBe(false);
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'ok', url: 'http://x.example/mcp', authType: 'header', authHeaderName: 'x-api-key', authSecret: 'a\nb' }).success).toBe(false);
      expect(servers.serverInput.safeParse({ name: 'X1', slug: 'ok', url: 'http://x.example/mcp', authType: 'header', authHeaderName: 'x-api-key', authSecret: 'k' }).success).toBe(true);
    });
  });

  describe('SSRF', () => {
    it('refuses loopback, private, metadata and credentialed URLs when saving', async () => {
      for (const target of ['http://127.0.0.1:1/mcp', 'http://169.254.169.254/latest', 'http://192.168.0.10/mcp', 'http://[::1]/mcp', 'https://user:pw@example.com/mcp']) {
        await expect(servers.createServer(input({ url: target })), target).rejects.toMatchObject({ status: 400 });
      }
      expect(await sql`SELECT 1 FROM mcp_servers WHERE NOT is_builtin`).toHaveLength(0);
    });

    it('does not follow redirects (a redirect to the metadata address fails the test)', async () => {
      const id = await servers.createServer(input());
      mode = 'redirect';
      const result = await servers.testServer(id);
      expect(result).toMatchObject({ ok: false });
      expect(seen.every((entry) => entry.authorization !== undefined)).toBe(true);
      expect(seen).toHaveLength(1); // only the original address was contacted
    });
  });

  describe('create / test / secrets', () => {
    it('stores the token encrypted, never returns it, sends it as a bearer header and caches the tools', async () => {
      const id = await servers.createServer(input());
      const [stored] = await sql<{ auth_secret_encrypted: string; auth_hint: string }[]>`SELECT auth_secret_encrypted, auth_hint FROM mcp_servers WHERE id = ${id}`;
      expect(stored.auth_secret_encrypted.startsWith('v1:')).toBe(true);
      expect(stored.auth_secret_encrypted).not.toContain(requiredToken);
      expect(stored.auth_hint).toBe('1234');

      const result = await servers.testServer(id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.tools.map((tool) => tool.name).sort()).toEqual(['always_fails', 'big_text', 'delete_everything', 'get_weather']);
      expect(seen.some((entry) => entry.authorization === `Bearer ${requiredToken}`)).toBe(true);

      const view = await servers.getServer(id);
      expect(JSON.stringify(view)).not.toContain(requiredToken);
      expect(JSON.stringify(view)).not.toContain('auth_secret_encrypted');
      expect(view).toMatchObject({ has_secret: true, auth_hint: '1234', last_status: 'ok', last_error: null });
      const weather = view.tools_cache.find((tool) => tool.name === 'get_weather');
      expect(weather).toMatchObject({ readOnly: true, destructive: null });
      expect(view.tools_cache.find((tool) => tool.name === 'delete_everything')).toMatchObject({ destructive: true });
    });

    it('supports a custom header for authentication', async () => {
      const id = await servers.createServer(input({ slug: 'apikey', authType: 'header', authHeaderName: 'x-api-key' }));
      expect((await servers.testServer(id)).ok).toBe(true);
      expect(seen.some((entry) => entry.apiKey === requiredToken)).toBe(true);
    });

    it('reports a wrong token in plain language and records the failure', async () => {
      const id = await servers.createServer(input({ authSecret: 'wrong-token-0000' }));
      const result = await servers.testServer(id);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.message).toMatch(/xác thực/);
      expect(await servers.getServer(id)).toMatchObject({ last_status: 'error', tools_cache: [] });
    });

    it('reports a refused connection in plain language', async () => {
      const id = await servers.createServer(input({ url: closedBase, authType: 'none', authSecret: undefined }));
      const result = await servers.testServer(id);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.message).toMatch(/từ chối kết nối/);
    });

    it('keeps the stored secret when an update leaves it empty, and replaces it when given', async () => {
      const id = await servers.createServer(input());
      await servers.updateServer(id, input({ name: 'Thời tiết 2', authSecret: undefined }));
      expect((await servers.testServer(id)).ok).toBe(true);
      await servers.updateServer(id, input({ authSecret: 'wrong-token-0000' }));
      const after = await servers.getServer(id);
      expect(after).toMatchObject({ auth_hint: '0000', last_status: null }); // address/credential change resets the last result
      expect((await servers.testServer(id)).ok).toBe(false);
    });

    it('requires a secret when switching on authentication', async () => {
      const id = await servers.createServer(input({ authType: 'none', authSecret: undefined }));
      await expect(servers.updateServer(id, input({ authSecret: undefined }))).rejects.toMatchObject({ status: 400 });
      await servers.updateServer(id, input({ authType: 'none', authSecret: undefined }));
      expect(await servers.getServer(id)).toMatchObject({ has_secret: false, auth_type: 'none' });
    });

    it('rejects a duplicate slug', async () => {
      await servers.createServer(input());
      await expect(servers.createServer(input({ name: 'Khác' }))).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('built-in server and dependencies', () => {
    it('cannot be edited, disabled or deleted', async () => {
      const [builtin] = await servers.listServers();
      expect(builtin).toMatchObject({ is_builtin: true, slug: 'fashion_tomodev', enabled: true });
      await expect(servers.updateServer(builtin.id, input())).rejects.toMatchObject({ status: 403 });
      await expect(servers.setServerEnabled(builtin.id, false)).rejects.toMatchObject({ status: 403 });
      await expect(servers.deleteServer(builtin.id)).rejects.toMatchObject({ status: 403 });
    });

    it('refuses to delete a server an agent uses, naming the agent; disabling warns instead', async () => {
      await seed.ensureAiDefaults();
      const id = await servers.createServer(input());
      const [agent] = await sql<{ id: string }[]>`SELECT id FROM ai_agents WHERE is_default`;
      await sql`INSERT INTO agent_mcp_servers (agent_id, mcp_server_id) VALUES (${agent.id}, ${id})`;
      await expect(servers.deleteServer(id)).rejects.toThrow(/Trợ lý Fashion Tomodev/);
      expect((await servers.setServerEnabled(id, false)).warnAgents.map((item) => item.name)).toEqual(['Trợ lý Fashion Tomodev']);
      await sql`DELETE FROM agent_mcp_servers WHERE mcp_server_id = ${id}`;
      await servers.deleteServer(id);
      expect(await sql`SELECT 1 FROM mcp_servers WHERE id = ${id}`).toHaveLength(0);
    });

    it('lets a disabled external server stop providing tools to agents', async () => {
      await seed.ensureAiDefaults();
      const agents = await import('@/features/ai/agents');
      const [{ id: threadId }] = await sql<{ id: string }[]>`INSERT INTO chat_threads (id, visitor_id) VALUES (gen_random_uuid(), 'v') RETURNING id`;
      const builtin = (await servers.listServers())[0];
      await sql`UPDATE mcp_servers SET enabled = false WHERE id = ${builtin.id}`; // only to prove the query honours the flag
      agents.invalidateAgentCache();
      expect((await agents.loadAgentRuntime(threadId)).enabledBuiltin.size).toBe(0);
    });
  });

  describe('listing and ticking tools before saving', () => {
    const connection = (overrides: Record<string, unknown> = {}) => servers.discoverInput.parse({ url: base, authType: 'bearer', authSecret: requiredToken, ...overrides });

    it('lists the tools from the typed connection without saving anything', async () => {
      const result = await servers.discoverTools(connection());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.tools.map((tool) => tool.name).sort()).toEqual(['always_fails', 'big_text', 'delete_everything', 'get_weather']);
      expect(await sql`SELECT 1 FROM mcp_servers WHERE NOT is_builtin`).toHaveLength(0);
    });

    it('names authentication and a wrong path even when the server sends an empty error body', async () => {
      mode = 'bare401';
      const unauthorized = await servers.discoverTools(connection());
      expect(unauthorized).toMatchObject({ ok: false });
      if (!unauthorized.ok) expect(unauthorized.message).toMatch(/xác thực/);
      mode = 'bare404';
      const missing = await servers.discoverTools(connection());
      expect(missing).toMatchObject({ ok: false });
      if (!missing.ok) expect(missing.message).toMatch(/endpoint MCP/);
    });

    it('reports a wrong token, a blocked address or a refused connection as a message, not an exception', async () => {
      const wrong = await servers.discoverTools(connection({ authSecret: 'wrong-token-0000' }));
      expect(wrong).toMatchObject({ ok: false });
      if (!wrong.ok) expect(wrong.message).toMatch(/xác thực/);
      const blocked = await servers.discoverTools(connection({ url: 'http://169.254.169.254/latest', authType: 'none', authSecret: undefined }));
      expect(blocked).toMatchObject({ ok: false });
      const refused = await servers.discoverTools(connection({ url: closedBase, authType: 'none', authSecret: undefined }));
      expect(refused).toMatchObject({ ok: false });
    });

    it('needs a secret for an unsaved server, but reuses the stored one for a saved server when left empty', async () => {
      expect(await servers.discoverTools(connection({ authSecret: undefined }))).toMatchObject({ ok: false });
      const id = await servers.createServer(input());
      const result = await servers.discoverTools(connection({ authSecret: undefined, serverId: id }));
      expect(result.ok).toBe(true);
    });

    it('does not offer discovery for the built-in server, nor for an unknown one', async () => {
      const [builtin] = await servers.listServers();
      expect(await servers.discoverTools(connection({ serverId: builtin.id }))).toMatchObject({ ok: false });
      await expect(servers.discoverTools(connection({ serverId: '00000000-0000-4000-8000-000000000000' }))).rejects.toMatchObject({ status: 404 });
    });

    it('saves only the ticked tools, with the approval flag, and caches the fresh tool list', async () => {
      const id = await servers.createServer(input({ selectedTools: [{ name: 'get_weather', requiresApproval: false }, { name: 'delete_everything', requiresApproval: true }] }));
      const saved = await servers.getServer(id);
      expect(saved.selected_tools).toEqual([{ name: 'get_weather', requiresApproval: false }, { name: 'delete_everything', requiresApproval: true }]);
      expect(saved.tools_cache.map((tool) => tool.name).sort()).toEqual(['always_fails', 'big_text', 'delete_everything', 'get_weather']);
      expect(saved).toMatchObject({ last_status: 'ok' });
    });

    it('refuses to save a tool the server does not list, or when the list cannot be fetched', async () => {
      await expect(servers.createServer(input({ selectedTools: [{ name: 'not_a_tool', requiresApproval: false }] }))).rejects.toThrow(/không còn tool: not_a_tool/);
      await expect(servers.createServer(input({ authSecret: 'wrong-token-0000', selectedTools: [{ name: 'get_weather', requiresApproval: false }] }))).rejects.toThrow(/Không lấy được danh sách tool/);
      expect(await sql`SELECT 1 FROM mcp_servers WHERE NOT is_builtin`).toHaveLength(0);
    });

    it('saves without any ticked tool, and keeps the old selection when the connection test refreshes the list', async () => {
      const bare = await servers.createServer(input({ slug: 'bare' }));
      expect(await servers.getServer(bare)).toMatchObject({ selected_tools: [], tools_cache: [] });
      const id = await servers.createServer(input({ selectedTools: [{ name: 'get_weather', requiresApproval: false }] }));
      await servers.testServer(id);
      expect((await servers.getServer(id)).selected_tools).toEqual([{ name: 'get_weather', requiresApproval: false }]);
    });

    it('re-verifies the selection on update and replaces it', async () => {
      const id = await servers.createServer(input({ selectedTools: [{ name: 'get_weather', requiresApproval: false }] }));
      await servers.updateServer(id, input({ selectedTools: [{ name: 'big_text', requiresApproval: true }], authSecret: undefined }));
      expect((await servers.getServer(id)).selected_tools).toEqual([{ name: 'big_text', requiresApproval: true }]);
      await expect(servers.updateServer(id, input({ selectedTools: [{ name: 'gone', requiresApproval: false }], authSecret: undefined }))).rejects.toMatchObject({ status: 400 });
      expect((await servers.getServer(id)).selected_tools).toEqual([{ name: 'big_text', requiresApproval: true }]);
      await servers.updateServer(id, input({ selectedTools: [], authSecret: undefined }));
      expect((await servers.getServer(id)).selected_tools).toEqual([]);
    });

    it('lets the built-in server change its ticked tools only, with names from the system', async () => {
      const [builtin] = await servers.listServers();
      expect(builtin.selected_tools).toHaveLength(10);
      await servers.setBuiltinSelectedTools(builtin.id, [{ name: 'view_cart', requiresApproval: true }, { name: 'view_cart', requiresApproval: false }]);
      expect((await servers.getServer(builtin.id)).selected_tools).toEqual([{ name: 'view_cart', requiresApproval: false }]); // deduplicated; approval is never set from here
      await expect(servers.setBuiltinSelectedTools(builtin.id, [{ name: 'drop_database', requiresApproval: false }])).rejects.toMatchObject({ status: 400 });
      const external = await servers.createServer(input({ slug: 'ext' }));
      await expect(servers.setBuiltinSelectedTools(external, [])).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('calling a tool (agent runtime)', () => {
    const schema = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] };

    it('calls the tool with the model arguments, authenticating with the stored secret, and returns its text', async () => {
      const id = await servers.createServer(input());
      const result = await external.callExternalTool(id, 'get_weather', { city: 'Hà Nội' }, schema, 'trace');
      expect(result).toEqual({ text: 'Nắng ở Hà Nội', isError: false, truncated: false });
      expect(seen.some((entry) => entry.authorization === `Bearer ${requiredToken}`)).toBe(true);
    });

    it('validates the arguments against the published schema before any request is made', async () => {
      const id = await servers.createServer(input());
      seen.length = 0;
      await expect(external.callExternalTool(id, 'get_weather', { city: 5 }, schema, 'trace')).rejects.toMatchObject({ status: 400 });
      await expect(external.callExternalTool(id, 'get_weather', {}, schema, 'trace')).rejects.toThrow(/không hợp lệ/);
      expect(seen).toHaveLength(0);
    });

    it('reports a tool error result as an error (not an exception) and caps long output', async () => {
      const id = await servers.createServer(input());
      expect(await external.callExternalTool(id, 'always_fails', {}, {}, 'trace')).toEqual({ text: 'không có dữ liệu', isError: true, truncated: false });
      const big = await external.callExternalTool(id, 'big_text', {}, {}, 'trace');
      expect(big.text).toHaveLength(8_000);
      expect(big.truncated).toBe(true);
    });

    it('refuses a disabled server, the built-in server and a wrong credential with plain messages', async () => {
      const id = await servers.createServer(input());
      await servers.setServerEnabled(id, false);
      await expect(external.callExternalTool(id, 'get_weather', { city: 'A' }, schema, 'trace')).rejects.toMatchObject({ status: 409 });
      await servers.setServerEnabled(id, true);
      const bad = await servers.createServer(input({ slug: 'badtoken', authSecret: 'wrong-token-0000' }));
      await expect(external.callExternalTool(bad, 'get_weather', { city: 'A' }, schema, 'trace')).rejects.toMatchObject({ status: 502 });
      const [builtin] = await servers.listServers();
      await expect(external.callExternalTool(builtin.id, 'view_cart', {}, {}, 'trace')).rejects.toMatchObject({ status: 400 });
    });
  });
});
