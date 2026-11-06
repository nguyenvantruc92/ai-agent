import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('AI agent administration (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let seed: typeof import('@/features/ai/seed');
  let agents: typeof import('@/features/ai/agents');
  let admin: typeof import('@/features/ai/agent-admin');
  let approvals: typeof import('@/features/agent/approvals');
  let visitor: typeof import('@/features/chat/visitor');
  let servers: typeof import('@/features/mcp/servers');
  let policyScopeId: string;
  let weatherId: string;
  let builtinId: string;

  const weatherTools = [{ name: 'get_weather', description: 'Thời tiết theo thành phố', inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }, { name: 'delete_all', description: 'Xóa dữ liệu', inputSchema: {} }];
  const defaultPicks = [{ name: 'get_weather', requiresApproval: false }, { name: 'delete_all', requiresApproval: true }];
  /** An external server as saved by the MCP Server page: its tool list plus the tools ticked on it. */
  const server = async (slug: string, options: { enabled?: boolean; tools?: unknown[]; selected?: { name: string; requiresApproval: boolean }[] } = {}) => {
    const id = randomUUID();
    await sql`INSERT INTO mcp_servers (id, name, slug, url, enabled, tools_cache, selected_tools) VALUES (${id}, ${`Server ${slug}`}, ${slug}, 'https://example.com/mcp', ${options.enabled ?? true}, ${sql.json((options.tools ?? weatherTools) as never)}, ${sql.json((options.selected ?? defaultPicks) as never)})`;
    return id;
  };
  const input = (overrides: Record<string, unknown> = {}) => admin.agentInput.parse({
    name: 'Tư vấn', slug: 'tu-van', description: 'Agent tư vấn', instructions: 'Bạn là trợ lý tư vấn thời trang nam, trả lời ngắn gọn.', model: 'gpt-4.1-2025-04-14',
    temperature: 0.4, maxSteps: 4, maxToolCalls: 3, isActive: true, scopeIds: [policyScopeId], mcpServerIds: [], ...overrides,
  });
  const thread = async (agentId: string | null) => { const id = randomUUID(); await sql`INSERT INTO chat_threads (id, visitor_id, agent_id) VALUES (${id}, ${randomUUID()}, ${agentId})`; return id; };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.SETTINGS_ENCRYPTION_KEY = 'test-encryption-key-0123456789';
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    seed = await import('@/features/ai/seed');
    agents = await import('@/features/ai/agents');
    admin = await import('@/features/ai/agent-admin');
    servers = await import('@/features/mcp/servers');
    approvals = await import('@/features/agent/approvals');
    visitor = await import('@/features/chat/visitor');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE ai_agents, knowledge_scopes, mcp_servers, chat_threads CASCADE`;
    seed.resetAiSeedCache(); agents.invalidateAgentCache();
    await seed.ensureAiDefaults();
    policyScopeId = (await sql<{ id: string }[]>`SELECT id FROM knowledge_scopes WHERE tool_name = 'search_policy'`)[0].id;
    weatherId = await server('weather');
    builtinId = (await sql<{ id: string }[]>`SELECT id FROM mcp_servers WHERE is_builtin`)[0].id;
  });

  describe('create and update', () => {
    it('gives the agent every ticked tool of the MCP servers it picked, and nothing from servers it did not', async () => {
      const id = await admin.createAgent(input({ mcpServerIds: [weatherId] }));
      const runtime = await agents.loadAgentRuntime(await thread(id));
      expect(runtime).toMatchObject({ agentName: 'Tư vấn', model: 'gpt-4.1-2025-04-14', temperature: 0.4, maxSteps: 4, maxToolCalls: 3 });
      expect(runtime.enabledBuiltin.size).toBe(0); // the built-in server was not picked
      expect(runtime.scopes.map((scope) => scope.toolName)).toEqual(['search_policy']);
      expect([...runtime.externalTools.keys()].sort()).toEqual(['weather__delete_all', 'weather__get_weather']);
      expect(runtime.externalTools.get('weather__delete_all')).toMatchObject({ requiresApproval: true, serverId: weatherId, toolName: 'delete_all' });
      expect(runtime.externalTools.get('weather__get_weather')?.requiresApproval).toBe(false);
      expect(runtime.tools.map((tool) => tool.name).sort()).toEqual(['final_answer', 'search_policy', 'weather__delete_all', 'weather__get_weather']);
      expect(await admin.getAgentDetail(id)).toMatchObject({ is_default: false, mcpServerIds: [weatherId], scopeIds: [policyScopeId] });
    });

    it('uses the ticked tools of the built-in server, and follows later changes to the selection', async () => {
      const id = await admin.createAgent(input({ mcpServerIds: [builtinId] }));
      const threadId = await thread(id);
      expect((await agents.loadAgentRuntime(threadId)).enabledBuiltin.size).toBe(10);
      await servers.setBuiltinSelectedTools(builtinId, [{ name: 'search_products', requiresApproval: false }, { name: 'view_cart', requiresApproval: false }]);
      expect([...(await agents.loadAgentRuntime(threadId)).enabledBuiltin].sort()).toEqual(['search_products', 'view_cart']);
    });

    it('combines several servers, and unticking a tool on the server changes every agent using it', async () => {
      const id = await admin.createAgent(input({ mcpServerIds: [builtinId, weatherId] }));
      const threadId = await thread(id);
      let runtime = await agents.loadAgentRuntime(threadId);
      expect(runtime.enabledBuiltin.size).toBe(10);
      expect(runtime.externalTools.size).toBe(2);
      await sql`UPDATE mcp_servers SET selected_tools = ${sql.json([{ name: 'get_weather', requiresApproval: false }] as never)} WHERE id = ${weatherId}`;
      agents.invalidateAgentCache();
      runtime = await agents.loadAgentRuntime(threadId);
      expect([...runtime.externalTools.keys()]).toEqual(['weather__get_weather']);
    });

    it('replaces the bindings on update and clears the cache so the change applies at once', async () => {
      const id = await admin.createAgent(input({ mcpServerIds: [weatherId] }));
      const threadId = await thread(id);
      expect((await agents.loadAgentRuntime(threadId)).externalTools.size).toBe(2);
      await admin.updateAgent(id, input({ name: 'Tư vấn 2', scopeIds: [], mcpServerIds: [builtinId], maxToolCalls: 8, temperature: 1 }));
      const runtime = await agents.loadAgentRuntime(threadId);
      expect(runtime).toMatchObject({ agentName: 'Tư vấn 2', maxToolCalls: 8, temperature: 1 });
      expect(runtime.enabledBuiltin.size).toBe(10);
      expect(runtime.scopes).toEqual([]);
      expect(runtime.externalTools.size).toBe(0);
    });

    it('rejects unknown models, scopes and servers, disabled servers and servers with no tool ticked', async () => {
      await expect(admin.createAgent(input({ model: 'gpt-unknown' }))).rejects.toMatchObject({ status: 400 });
      await expect(admin.createAgent(input({ scopeIds: [randomUUID()] }))).rejects.toThrow(/scope không tồn tại/);
      await expect(admin.createAgent(input({ mcpServerIds: [randomUUID()] }))).rejects.toThrow(/không tồn tại/);
      const off = await server('off', { enabled: false });
      await expect(admin.createAgent(input({ mcpServerIds: [off] }))).rejects.toThrow(/đang tắt/);
      const empty = await server('empty', { selected: [] });
      await expect(admin.createAgent(input({ mcpServerIds: [empty] }))).rejects.toThrow(/chưa chọn tool nào/);
    });

    it('validates the form fields', () => {
      const base = { name: 'Tư vấn', slug: 'tu-van', instructions: 'Bạn là trợ lý tư vấn thời trang nam.', model: 'm', temperature: 0.3, maxSteps: 5, maxToolCalls: 5 };
      expect(admin.agentInput.safeParse(base).success).toBe(true);
      expect(admin.agentInput.safeParse({ ...base, instructions: 'ngắn' }).success).toBe(false);
      expect(admin.agentInput.safeParse({ ...base, slug: 'Bad Slug' }).success).toBe(false);
      expect(admin.agentInput.safeParse({ ...base, temperature: 3 }).success).toBe(false);
      expect(admin.agentInput.safeParse({ ...base, maxSteps: 0 }).success).toBe(false);
      expect(admin.agentInput.safeParse({ ...base, maxToolCalls: 21 }).success).toBe(false);
      expect(admin.agentInput.safeParse({ ...base, mcpServerIds: ['not-a-uuid'] }).success).toBe(false);
    });

    it('stores the whole prompt, the description and the tools signature the prompt was generated for', async () => {
      const id = await admin.createAgent(input({ description: 'Tư vấn viên thân thiện, xưng mình – bạn.', promptToolsSignature: 'b:search_products|s:search_policy' }));
      expect(await admin.getAgentDetail(id)).toMatchObject({ description: 'Tư vấn viên thân thiện, xưng mình – bạn.', prompt_tools_signature: 'b:search_products|s:search_policy', legacy_prompt: false });
      await admin.updateAgent(id, input({ instructions: 'Bạn là trợ lý mới, trả lời ngắn gọn bằng tiếng Việt.', promptToolsSignature: null }));
      expect(await admin.getAgentDetail(id)).toMatchObject({ instructions: 'Bạn là trợ lý mới, trả lời ngắn gọn bằng tiếng Việt.', prompt_tools_signature: null });
      // Prompts may mention {{...}}: nothing in code substitutes them any more.
      expect(admin.agentInput.safeParse({ ...input(), instructions: 'Dùng {{ngoặc}} tùy ý, đây là prompt hợp lệ dài đủ.' }).success).toBe(true);
    });

    it('gives agents created before this change the default rules once, and leaves new agents alone', async () => {
      const legacy = await admin.createAgent(input({ slug: 'cu', instructions: 'Bạn là trợ lý cũ của cửa hàng Fashion Tomodev.' }));
      await sql`UPDATE ai_agents SET legacy_prompt = true WHERE id = ${legacy}`;
      const fresh = await admin.createAgent(input({ slug: 'moi', instructions: 'Bạn là trợ lý mới của cửa hàng Fashion Tomodev.' }));
      seed.resetAiSeedCache();
      await seed.ensureAiDefaults();
      const upgraded = await admin.getAgentDetail(legacy);
      expect(upgraded?.legacy_prompt).toBe(false);
      expect(upgraded?.instructions.startsWith('Bạn là trợ lý cũ của cửa hàng Fashion Tomodev.\n\n')).toBe(true);
      expect(upgraded?.instructions).toContain('TRA ĐƠN VÀ XÁC MINH');
      expect((await admin.getAgentDetail(fresh))?.instructions).toBe('Bạn là trợ lý mới của cửa hàng Fashion Tomodev.');
      // Running the seed again does not append the rules a second time.
      seed.resetAiSeedCache();
      await seed.ensureAiDefaults();
      expect(((await admin.getAgentDetail(legacy))?.instructions.match(/TRA ĐƠN VÀ XÁC MINH/g) ?? []).length).toBe(1);
    });

    it('describes the selected tools to the prompt writer and signs them, without saving anything', async () => {
      const promptModule = await import('@/features/ai/agent-prompt');
      const seen: { system: string; user: string }[] = [];
      const complete = async (system: string, user: string) => { seen.push({ system, user }); return 'Bạn là trợ lý tư vấn. '.repeat(10); };
      const picked = { name: 'Tư vấn', description: 'Thân thiện, xưng mình – bạn.', model: 'gpt-4.1-2025-04-14', scopeIds: [policyScopeId], mcpServerIds: [builtinId, weatherId] };
      await servers.setBuiltinSelectedTools(builtinId, [{ name: 'search_products', requiresApproval: false }, { name: 'checkout', requiresApproval: false }]);
      const result = await promptModule.generateInstructions(promptModule.generatePromptInput.parse(picked), complete);
      expect(result.instructions).toContain('Bạn là trợ lý tư vấn.');
      expect(result.signature).toBe(['b:checkout', 'b:search_products', 's:search_policy', 'x:weather:delete_all:approval', 'x:weather:get_weather:auto'].join('|'));
      expect(seen[0].user).toContain('Thân thiện, xưng mình – bạn.');
      expect(seen[0].user).toContain('- checkout [khách phải bấm Xác nhận');
      expect(seen[0].user).toContain('- search_policy (Chính sách)');
      expect(seen[0].user).toContain('weather__delete_all [cần nhân viên duyệt]');
      expect(seen[0].user).not.toContain('add_to_cart'); // not ticked on the built-in server
      expect(seen[0].system).toContain('final_answer');
      expect((await sql`SELECT count(*)::int AS n FROM ai_agents WHERE slug = 'tu-van'`)[0].n).toBe(0);
      await expect(promptModule.generateInstructions(promptModule.generatePromptInput.parse({ ...picked, model: 'not-a-model' }), complete)).rejects.toThrow(/chưa được phép/);
      await expect(promptModule.generateInstructions(promptModule.generatePromptInput.parse({ ...picked, scopeIds: [randomUUID()] }), complete)).rejects.toThrow(/scope không tồn tại/);
    });

    it('refuses a duplicate slug', async () => {
      await admin.createAgent(input());
      await expect(admin.createAgent(input({ name: 'Khác' }))).rejects.toMatchObject({ code: '23505' });
    });

    it('drops tools the server no longer lists, and every tool of a disabled server', async () => {
      const id = await admin.createAgent(input({ mcpServerIds: [weatherId] }));
      const threadId = await thread(id);
      await sql`UPDATE mcp_servers SET tools_cache = ${sql.json([weatherTools[0]] as never)} WHERE id = ${weatherId}`;
      agents.invalidateAgentCache();
      expect([...(await agents.loadAgentRuntime(threadId)).externalTools.keys()]).toEqual(['weather__get_weather']);
      await sql`UPDATE mcp_servers SET enabled = false WHERE id = ${weatherId}`;
      agents.invalidateAgentCache();
      expect((await agents.loadAgentRuntime(threadId)).externalTools.size).toBe(0);
    });
  });

  describe('default, archive and delete', () => {
    it('switches the default atomically and only to an active agent', async () => {
      const first = (await agents.getDefaultAgent()).id;
      const second = await admin.createAgent(input());
      const off = await admin.createAgent(input({ name: 'Tắt', slug: 'tat', isActive: false }));
      await expect(admin.setDefaultAgent(off)).rejects.toMatchObject({ status: 409 });
      await admin.setDefaultAgent(second);
      expect((await agents.getDefaultAgent()).id).toBe(second);
      expect((await sql`SELECT 1 FROM ai_agents WHERE is_default`).length).toBe(1);
      expect((await admin.getAgentDetail(first))?.is_default).toBe(false);
    });

    it('does not let the default agent be turned off or removed', async () => {
      const current = await agents.getDefaultAgent();
      await expect(admin.updateAgent(current.id, input({ isActive: false }))).rejects.toMatchObject({ status: 409 });
      await expect(admin.removeAgent(current.id)).rejects.toMatchObject({ status: 409 });
    });

    it('archives an agent that has threads, deletes one that has none', async () => {
      const used = await admin.createAgent(input());
      const unused = await admin.createAgent(input({ name: 'Mới', slug: 'moi' }));
      const threadId = await thread(used);
      expect(await admin.removeAgent(used)).toBe('archived');
      expect(await admin.removeAgent(unused)).toBe('deleted');
      expect(await agents.getAgent(unused)).toBeUndefined();
      expect(await admin.getAgentDetail(used)).toBeUndefined(); // archived agents cannot be edited
      expect((await agents.listAgents()).map((agent) => agent.id)).not.toContain(used);
      // The old conversation keeps working, on the default agent.
      expect((await agents.agentForThread(threadId)).is_default).toBe(true);
      await expect(admin.removeAgent(used)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('threads', () => {
    it('starts visitor threads on the default agent and Chat thử threads on the chosen agent, flagged as test', async () => {
      const chosen = await admin.createAgent(input());
      const def = await agents.getDefaultAgent();
      const normal = await visitor.getOrCreateThread(undefined, 'v1');
      const test = await visitor.getOrCreateThread(undefined, 'v1', chosen);
      const rows = await sql<{ id: string; agent_id: string; is_test: boolean }[]>`SELECT id, agent_id, is_test FROM chat_threads WHERE id IN ${sql([normal, test])}`;
      expect(rows.find((row) => row.id === normal)).toMatchObject({ agent_id: def.id, is_test: false });
      expect(rows.find((row) => row.id === test)).toMatchObject({ agent_id: chosen, is_test: true });
      // An existing thread keeps its agent even when another one is requested.
      expect(await visitor.getOrCreateThread(test, 'v1', def.id)).toBe(test);
      await admin.removeAgent(chosen).catch(() => undefined);
      await expect(visitor.getOrCreateThread(undefined, 'v1', randomUUID())).rejects.toThrow(/chat thử/);
    });
  });

  describe('approvals for external tools', () => {
    it('stores an mcp_tool approval, and a new call id means a new approval', async () => {
      const threadId = await thread(null);
      const base = { threadId, action: 'mcp_tool' as const, payload: { tool: 'delete_all', args: '{}' }, summary: 'Gọi tool', sourceIds: [] };
      const a = await approvals.postgresApprovals.ensure({ ...base, idempotencyKey: 'k-1' });
      expect((await approvals.postgresApprovals.ensure({ ...base, idempotencyKey: 'k-1' })).id).toBe(a.id);
      const b = await approvals.postgresApprovals.ensure({ ...base, idempotencyKey: 'k-2' });
      expect(b.id).not.toBe(a.id);
      expect((await approvals.getApproval(a.id))?.action).toBe('mcp_tool');
    });
  });
});
