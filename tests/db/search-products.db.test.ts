import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

let embedding: 'ok' | 'down' = 'ok';
const unit = () => Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  embed: async () => { if (embedding === 'down') throw new Error('no key'); return { embedding: unit(), usage: { tokens: 1 } }; },
}));

describe.skipIf(!url)('search_products: keyword + meaning-based (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let tools: typeof import('@/features/agent/shop-tools');
  let categoryId: string;

  const v = (size: string, color: string, stock: number) => ({ size, color, stock, isActive: true });
  const product = (code: string, name: string, priceVnd = 300000) => admin.createProduct({
    code, name, categoryId, description: '', material: '', priceVnd, compareAtPriceVnd: null, status: 'active' as const, variants: [v('M', 'Đen', 5)],
  } as never);
  /** What the worker would index: a product chunk inside the catalog document. */
  async function indexed(code: string, stale = 'giá 1.000đ') {
    // Saving a product already queues an (unindexed) catalog document; give it a ready, active version once.
    let [document] = await sql<{ id: string; active_version_id: string | null }[]>`SELECT id, active_version_id FROM knowledge_documents WHERE storage_key = 'db:catalog'`;
    if (!document) {
      const id = randomUUID();
      await sql`INSERT INTO knowledge_documents (id, original_filename, storage_key, mime_type, content_hash, status) VALUES (${id}, 'catalog', 'db:catalog', 'application/x-catalog-db', 'h', 'ready')`;
      document = { id, active_version_id: null };
    }
    let versionId = document.active_version_id;
    if (!versionId) {
      versionId = randomUUID();
      await sql`INSERT INTO knowledge_document_versions (id, document_id, version, status) VALUES (${versionId}, ${document.id}, 99, 'ready')`;
      await sql`UPDATE knowledge_documents SET active_version_id = ${versionId} WHERE id = ${document.id}`;
    }
    await sql`
      INSERT INTO knowledge_chunks (id, document_version_id, source_id, source_type, title, content, content_hash, embedding_model, embedding)
      VALUES (${randomUUID()}, ${versionId}, ${`product:${code}`}, 'product', ${code}, ${stale}, ${randomUUID()}, 'test', ${`[${unit().join(',')}]`}::vector)`;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    tools = await import('@/features/agent/shop-tools');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    embedding = 'ok';
    await sql`TRUNCATE categories, products, knowledge_documents CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo', description: '', sortOrder: 0, isActive: true })).id;
  });

  it('finds a product by meaning when no keyword matches, with the live price from the products table', async () => {
    await product('AO-1', 'Áo dệt kim cổ tròn', 450000);
    await indexed('AO-1', 'Áo dệt kim, giá 1.000đ (nội dung index đã cũ)');
    const hits = await tools.searchProductsForAgent('đồ mặc đi làm màu nhã', null);
    expect(hits.map((hit) => hit.product_id)).toEqual(['AO-1']);
    expect(hits[0].price_vnd).toBe(450000);
  });

  it('merges keyword and semantic hits without duplicates', async () => {
    await product('AO-1', 'Áo polo đen');
    await product('AO-2', 'Áo len cổ lọ');
    await indexed('AO-1'); await indexed('AO-2');
    const hits = await tools.searchProductsForAgent('polo', null);
    expect(hits.map((hit) => hit.product_id).sort()).toEqual(['AO-1', 'AO-2']);
    expect(hits[0].product_id).toBe('AO-1'); // found by both searches
  });

  it('respects the budget for semantic-only hits and never returns hidden products', async () => {
    await product('AO-1', 'Áo dệt kim', 900000);
    await product('AO-2', 'Áo nháp', 100000);
    await sql`UPDATE products SET status = 'draft' WHERE code = 'AO-2'`;
    await indexed('AO-1'); await indexed('AO-2');
    expect(await tools.searchProductsForAgent('đồ nhã', 500000)).toEqual([]);
    expect((await tools.searchProductsForAgent('đồ nhã', null)).map((hit) => hit.product_id)).toEqual(['AO-1']);
  });

  it('falls back to keyword search when embeddings are unavailable', async () => {
    await product('AO-1', 'Áo polo đen');
    await indexed('AO-1');
    embedding = 'down';
    expect((await tools.searchProductsForAgent('polo', null)).map((hit) => hit.product_id)).toEqual(['AO-1']);
    expect(await tools.searchProductsForAgent('đồ nhã', null)).toEqual([]);
  });
});
