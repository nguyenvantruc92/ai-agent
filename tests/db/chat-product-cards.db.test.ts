import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('chat product boxes (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let cards: typeof import('@/features/chat/product-cards');
  let categoryId: string;

  const product = (code: string, name: string, priceVnd = 300000, status: 'active' | 'draft' = 'active') => admin.createProduct({
    code, name, categoryId, description: '', material: '', priceVnd, compareAtPriceVnd: null, status,
    variants: [{ size: 'M', color: 'Đen', stock: 5, isActive: true }],
  } as never);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    cards = await import('@/features/chat/product-cards');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo', description: '', sortOrder: 0, isActive: true })).id;
  });

  it('builds boxes from cited product sources, in citation order, with the live price and a link slug', async () => {
    await product('AO-1', 'Áo polo đen', 350000);
    await product('AO-2', 'Áo len cổ lọ', 450000);
    const result = await cards.productCardsForSources([{ id: 'product:AO-2' }, { id: 'policy:faq-1' }, { id: 'product:AO-1' }, { id: 'product:AO-2' }]);
    expect(result.map((card) => card.code)).toEqual(['AO-2', 'AO-1']);
    expect(result[1]).toMatchObject({ name: 'Áo polo đen', priceVnd: 350000 });
    expect(result[0].slug).toBeTruthy();
  });

  it('skips hidden or unknown products and answers without product sources with no boxes', async () => {
    await product('AO-1', 'Áo polo đen');
    await product('AO-2', 'Áo nháp', 100000, 'draft');
    expect((await cards.productCardsForSources([{ id: 'product:AO-2' }, { id: 'product:ZZ-9' }, { id: 'product:AO-1' }])).map((card) => card.code)).toEqual(['AO-1']);
    expect(await cards.productCardsForSources([{ id: 'cart:current' }, { id: 'order:FT-2026-1001' }])).toEqual([]);
    expect(await cards.productCardsForSources(undefined)).toEqual([]);
  });

  it('shows at most five boxes', async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) await product(`AO-${n}`, `Áo ${n}`);
    const result = await cards.productCardsForSources([1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `product:AO-${n}` })));
    expect(result).toHaveLength(5);
  });
});
