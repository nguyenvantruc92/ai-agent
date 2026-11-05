import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

const unit = () => Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), embed: async () => ({ embedding: unit(), usage: { tokens: 1 } }) }));

describe.skipIf(!url)('unscoped retrieval: category filter follows the categories table (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let repo: typeof import('@/features/catalog/admin-repository');
  let retrieve: typeof import('@/features/rag/retrieval').retrieve;

  /** One product chunk in the catalog document, tagged with `category` the way the worker tags it. */
  async function productChunk(code: string, category: string) {
    const [document] = await sql<{ active_version_id: string }[]>`SELECT active_version_id FROM knowledge_documents WHERE storage_key = 'db:catalog'`;
    await sql`
      INSERT INTO knowledge_chunks (id, document_version_id, source_id, source_type, title, content, metadata, content_hash, embedding_model, embedding)
      VALUES (${randomUUID()}, ${document.active_version_id}, ${`product:${code}`}, 'product', ${code}, 'nội dung',
        ${sql.json({ category })}, ${randomUUID()}, 'test', ${`[${unit().join(',')}]`}::vector)`;
  }
  const runNames = async (message: string) => (await retrieve({ query: message, message, traceId: randomUUID() })).queries.map((query) => query.name);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    repo = await import('@/features/catalog/admin-repository');
    ({ retrieve } = await import('@/features/rag/retrieval'));
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, knowledge_documents, audit_logs CASCADE`;
    const id = randomUUID();
    const versionId = randomUUID();
    await sql`INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash, status) VALUES (${id}, 'catalog', 'db:catalog', 'application/x-catalog-db', 'h', 'ready')`;
    await sql`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${id}, 1, 'ready')`;
    await sql`UPDATE knowledge_documents SET active_version_id = ${versionId} WHERE id = ${id}`;
  });

  it('adds a category search for a category created in Admin, matched without diacritics', async () => {
    await runNames('có giày lười không'); // warms the name cache before the category exists
    await repo.createCategory({ name: 'Giày lười', description: '', sortOrder: 0, isActive: true });
    await productChunk('GL-001', 'Giày lười');

    expect(await runNames('có giày lười không')).toContain('category:Giày lười');
    expect(await runNames('co giay luoi khong')).toContain('category:Giày lười');
    expect((await retrieve({ query: 'giày lười', message: 'giày lười', traceId: randomUUID() })).chunks.map((chunk) => chunk.source_id)).toContain('product:GL-001');
  });

  it('follows renames and hidden categories at once', async () => {
    const category = await repo.createCategory({ name: 'Giày lười', description: '', sortOrder: 0, isActive: true });
    expect(await runNames('giày lười')).toContain('category:Giày lười');

    await repo.updateCategory(category.id, { name: 'Giày da', description: '', sortOrder: 0, isActive: true });
    expect(await runNames('giày lười')).not.toContain('category:Giày lười');
    expect(await runNames('giày da')).toContain('category:Giày da');

    await repo.updateCategory(category.id, { name: 'Giày da', description: '', sortOrder: 0, isActive: false });
    expect((await runNames('giày da')).some((name) => name.startsWith('category:'))).toBe(false);
  });

  it('does not run the category search for scoped retrieval', async () => {
    await repo.createCategory({ name: 'Giày lười', description: '', sortOrder: 0, isActive: true });
    const result = await retrieve({ query: 'giày lười', message: 'giày lười', traceId: randomUUID(), scope: { documentIds: [randomUUID()] } });
    expect(result.queries.map((query) => query.name)).toEqual(['scope']);
  });
});
