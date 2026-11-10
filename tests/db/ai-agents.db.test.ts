import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

// Retrieval embeds the question; every embedding here is the same unit vector, so similarity is 1 for every chunk and the tests
// can check which documents a scope is allowed to see.
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), embed: async () => ({ embedding: unit(), usage: { tokens: 1 } }) }));
const unit = () => Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));

describe.skipIf(!url)('AI agents, knowledge scopes and MCP registry (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let seed: typeof import('@/features/ai/seed');
  let agents: typeof import('@/features/ai/agents');
  let scopes: typeof import('@/features/knowledge/scopes');

  async function document(filename: string, options: { mime?: string; storageKey?: string; chunks?: { sourceId: string; type: 'policy' | 'product' }[]; deleted?: boolean } = {}) {
    const id = randomUUID();
    const versionId = randomUUID();
    await sql`INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash, status, deleted_at) VALUES (${id}, ${filename}, ${options.storageKey ?? `uploads/${id}.pdf`}, ${options.mime ?? 'application/pdf'}, 'h', 'ready', ${options.deleted ? new Date() : null})`;
    await sql`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${id}, 1, 'ready')`;
    await sql`UPDATE knowledge_documents SET active_version_id = ${versionId} WHERE id = ${id}`;
    for (const chunk of options.chunks ?? []) {
      await sql`
        INSERT INTO knowledge_chunks (id, document_version_id, source_id, source_type, title, content, content_hash, embedding_model, embedding)
        VALUES (${randomUUID()}, ${versionId}, ${chunk.sourceId}, ${chunk.type}, ${chunk.sourceId}, 'nội dung', ${randomUUID()}, 'test', ${`[${unit().join(',')}]`}::vector)`;
    }
    return id;
  }
  const thread = async (agentId: string | null = null) => {
    const id = randomUUID();
    await sql`INSERT INTO chat_threads (id, visitor_id, agent_id) VALUES (${id}, ${randomUUID()}, ${agentId})`;
    return id;
  };
  const scopeInput = (overrides: Record<string, unknown> = {}) => scopes.scopeInput.parse({ name: 'Bảo hành', toolName: 'search_warranty', description: 'Tra cứu chính sách bảo hành và sửa chữa sản phẩm của cửa hàng.', documentIds: [], ...overrides });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    seed = await import('@/features/ai/seed');
    agents = await import('@/features/ai/agents');
    scopes = await import('@/features/knowledge/scopes');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE ai_agents, knowledge_scopes, mcp_servers, knowledge_documents, chat_threads CASCADE`;
    seed.resetAiSeedCache();
    agents.invalidateAgentCache();
  });

  describe('seed', () => {
    it('creates the built-in server, the default agent with every built-in tool and the policy scope', async () => {
      const faq = await document('faq.pdf', { chunks: [{ sourceId: 'policy:a:1', type: 'policy' }] });
      await document('catalog', { mime: 'application/x-catalog-db', storageKey: 'db:catalog' });
      await seed.ensureAiDefaults();

      const agent = await agents.getDefaultAgent();
      expect(agent).toMatchObject({ slug: 'fashion-tomodev', is_default: true, is_active: true });
      expect(agent.instructions).toContain('Fashion Tomodev');
      const [server] = await sql<{ slug: string; is_builtin: boolean; url: string }[]>`SELECT slug, is_builtin, url FROM mcp_servers`;
      expect(server).toMatchObject({ slug: 'fashion_tomodev', is_builtin: true });

      const runtime = await agents.loadAgentRuntime(await thread(agent.id));
      expect([...runtime.enabledBuiltin].sort()).toEqual(['add_to_cart', 'cancel_order', 'checkout', 'create_exchange_request', 'create_return_request', 'lookup_order', 'lookup_product', 'search_products', 'set_cart_quantity', 'view_cart']);
      expect(runtime.scopes.map((scope) => scope.toolName)).toEqual(['search_policy']);
      expect(runtime.tools.map((tool) => tool.name)).toContain('search_policy');
      expect(runtime.tools.at(-1)?.name).toBe('final_answer');
      // Existing knowledge files go into the policy scope; the catalog document does not.
      const linked = await sql<{ document_id: string }[]>`SELECT document_id FROM knowledge_scope_documents`;
      expect(linked.map((row) => row.document_id)).toEqual([faq]);
    });

    it('is idempotent and does not bring back things an admin removed', async () => {
      await seed.seedAiDefaults();
      await seed.seedAiDefaults();
      expect((await sql`SELECT 1 FROM ai_agents`).length).toBe(1);
      expect((await sql`SELECT 1 FROM mcp_servers`).length).toBe(1);
      await sql`DELETE FROM agent_knowledge_scopes`;
      await sql`DELETE FROM knowledge_scopes`;
      await seed.seedAiDefaults();
      expect((await sql`SELECT 1 FROM knowledge_scopes`).length).toBe(0);
    });

    it('gives threads without an agent (or with an archived one) the default agent', async () => {
      await seed.ensureAiDefaults();
      const agent = await agents.getDefaultAgent();
      const orphan = await thread(null);
      expect((await agents.agentForThread(orphan)).id).toBe(agent.id);
      const other = randomUUID();
      await sql`INSERT INTO ai_agents (id, name, slug, model, archived_at) VALUES (${other}, 'Cũ', 'cu', 'm', now())`;
      expect((await agents.agentForThread(await thread(other))).id).toBe(agent.id);
    });

    it('allows only one default agent', async () => {
      await seed.ensureAiDefaults();
      await expect(sql`INSERT INTO ai_agents (id, name, slug, model, is_default) VALUES (${randomUUID()}, 'B', 'b', 'm', true)`).rejects.toThrow();
    });
  });

  describe('knowledge scopes', () => {
    it('validates tool names: format, reserved names and the external-tool separator', () => {
      expect(scopes.scopeInput.safeParse({ name: 'X', toolName: 'search_policy', description: 'x'.repeat(30) }).success).toBe(false); // name too short
      for (const toolName of ['Search', 'a', 'checkout', 'final_answer', 'search_knowledge', 'my__tool', '1abc']) {
        expect(scopes.scopeInput.safeParse({ name: 'Bảo hành', toolName, description: 'x'.repeat(30) }).success, toolName).toBe(false);
      }
      expect(scopes.scopeInput.safeParse({ name: 'Bảo hành', toolName: 'search_warranty', description: 'x'.repeat(30) }).success).toBe(true);
      expect(scopes.scopeInput.safeParse({ name: 'Bảo hành', toolName: 'search_warranty', description: 'quá ngắn' }).success).toBe(false);
    });

    it('creates, updates and lists a scope with its files', async () => {
      const a = await document('a.pdf');
      const b = await document('b.pdf');
      const id = await scopes.createScope(scopeInput({ documentIds: [a] }));
      expect((await scopes.getScope(id))?.documents.map((doc) => doc.id)).toEqual([a]);
      await scopes.updateScope(id, scopeInput({ name: 'Bảo hành 2', documentIds: [b, a] }));
      const [summary] = await scopes.listScopes();
      expect(summary).toMatchObject({ name: 'Bảo hành 2', document_count: 2, agents: [] });
      // The same file may belong to several scopes.
      const second = await scopes.createScope(scopeInput({ name: 'Khác', toolName: 'search_other', documentIds: [a] }));
      expect((await scopes.scopesByDocument()).get(a)?.map((scope) => scope.id).sort()).toEqual([id, second].sort());
    });

    it('rejects the catalog document, deleted files and duplicate tool names', async () => {
      const catalog = await document('catalog', { mime: 'application/x-catalog-db', storageKey: 'db:catalog' });
      const gone = await document('gone.pdf', { deleted: true });
      await expect(scopes.createScope(scopeInput({ documentIds: [catalog] }))).rejects.toThrow(/không thể đưa vào scope/);
      await expect(scopes.createScope(scopeInput({ documentIds: [gone] }))).rejects.toThrow(/không thể đưa vào scope/);
      expect((await scopes.assignableDocuments()).map((doc) => doc.id)).not.toContain(catalog);
      await scopes.createScope(scopeInput());
      await expect(scopes.createScope(scopeInput({ name: 'Trùng' }))).rejects.toMatchObject({ code: '23505' });
    });

    it('refuses to delete a scope an agent uses, naming the agent', async () => {
      await seed.ensureAiDefaults();
      const [policy] = await scopes.listScopes();
      await expect(scopes.deleteScope(policy.id)).rejects.toThrow(/Trợ lý Fashion Tomodev/);
      const free = await scopes.createScope(scopeInput());
      await scopes.deleteScope(free);
      expect(await scopes.getScope(free)).toBeUndefined();
    });

    it("searches only the scope's own documents (and the generated shipping chunk when enabled)", async () => {
      const inside = await document('inside.pdf', { chunks: [{ sourceId: 'policy:inside:1', type: 'policy' }] });
      await document('outside.pdf', { chunks: [{ sourceId: 'policy:outside:1', type: 'policy' }] });
      await document('catalog', { mime: 'application/x-catalog-db', storageKey: 'db:catalog', chunks: [{ sourceId: 'policy:phi-giao-hang-hien-hanh:1', type: 'policy' }, { sourceId: 'product:SM-001', type: 'product' }] });
      const plain = await scopes.createScope(scopeInput({ documentIds: [inside] }));
      const withShipping = await scopes.createScope(scopeInput({ name: 'Có ship', toolName: 'search_ship', documentIds: [inside], includeSystemPolicy: true }));
      const empty = await scopes.createScope(scopeInput({ name: 'Rỗng', toolName: 'search_empty' }));

      const ids = async (scopeId: string) => (await scopes.testScopeRetrieval(scopeId, 'câu hỏi', 'trace')).chunks.map((chunk) => chunk.source_id).sort();
      expect(await ids(plain)).toEqual(['policy:inside:1']);
      expect(await ids(withShipping)).toEqual(['policy:inside:1', 'policy:phi-giao-hang-hien-hanh:1']); // never the catalog's product chunks
      expect(await ids(empty)).toEqual([]);
    });

    it("lets a thread search only scopes enabled for its agent", async () => {
      await seed.ensureAiDefaults();
      const agent = await agents.getDefaultAgent();
      const faq = await document('faq.pdf', { chunks: [{ sourceId: 'policy:faq:1', type: 'policy' }] });
      await seed.linkToPolicyScope(faq);
      const threadId = await thread(agent.id);
      const hits = await scopes.searchScopeForThread(threadId, 'search_policy', 'đổi size', 'trace');
      expect(hits.map((hit) => hit.source_id)).toEqual(['policy:faq:1']);

      const notGiven = await scopes.createScope(scopeInput({ documentIds: [faq] }));
      expect(notGiven).toBeTruthy();
      await expect(scopes.searchScopeForThread(threadId, 'search_warranty', 'bảo hành', 'trace')).rejects.toMatchObject({ status: 403 });
      await expect(scopes.searchScopeForThread(threadId, 'search_nope', 'x', 'trace')).rejects.toMatchObject({ status: 403 });
    });
  });
});
