import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('storefront queries (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let store: typeof import('@/features/catalog/queries');
  let schemas: typeof import('@/features/catalog/schemas');
  let shirts: string;
  let pants: string;

  const v = (size: string, color: string, stock: number, isActive = true) => ({ size, color, stock, isActive });
  const make = (overrides: Record<string, unknown>) => admin.createProduct({
    code: 'T-1', name: 'Sản phẩm thử', categoryId: shirts, description: '', material: '', priceVnd: 400000, compareAtPriceVnd: null, status: 'active' as const, variants: [v('M', 'Trắng', 10)], ...overrides,
  } as never);
  const list = (query: Record<string, unknown> = {}) => store.listStoreProducts(schemas.storeListQuery.parse(query));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    admin = await import('@/features/catalog/admin-repository');
    store = await import('@/features/catalog/queries');
    schemas = await import('@/features/catalog/schemas');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, knowledge_documents, audit_logs CASCADE`;
    shirts = (await admin.createCategory({ name: 'Áo sơ mi', description: '', sortOrder: 0, isActive: true })).id;
    pants = (await admin.createCategory({ name: 'Quần', description: '', sortOrder: 1, isActive: true })).id;
  });

  it('never exposes drafts, archived or deleted products, nor products in a hidden category', async () => {
    await make({ code: 'OK-1' });
    await make({ code: 'DR-1', status: 'draft' });
    await make({ code: 'AR-1', status: 'archived' });
    const gone = await make({ code: 'DEL-1' });
    await admin.softDeleteProduct(gone.id);
    const hidden = await admin.createCategory({ name: 'Ẩn', description: '', sortOrder: 5, isActive: false });
    const inHidden = await make({ code: 'HID-1', categoryId: hidden.id });

    expect((await list()).items.map((item) => item.code)).toEqual(['OK-1']);
    await expect(store.getStoreProduct(gone.slug)).rejects.toMatchObject({ status: 404 });
    await expect(store.getStoreProduct(inHidden.slug)).rejects.toMatchObject({ status: 404 });
    expect((await store.listStoreCategories()).map((category) => category.name)).toEqual(['Áo sơ mi', 'Quần']);
  });

  it('counts only visible products per category', async () => {
    await make({ code: 'A-1' }); await make({ code: 'A-2', status: 'draft' }); await make({ code: 'B-1', categoryId: pants });
    const counts = Object.fromEntries((await store.listStoreCategories()).map((category) => [category.slug, category.productCount]));
    expect(counts).toEqual({ 'ao-so-mi': 1, quan: 1 });
  });

  it('searches ignoring case and accents, requires every word, and treats LIKE wildcards literally', async () => {
    await make({ code: 'SM-901', name: 'Áo sơ mi Oxford trắng', description: 'Chất liệu cotton thoáng' });
    await make({ code: 'QT-901', name: 'Quần chinos Đen', categoryId: pants });
    const names = async (q: string) => (await list({ q })).items.map((item) => item.code);
    expect(await names('ao so mi')).toEqual(['SM-901']);
    expect(await names('OXFORD')).toEqual(['SM-901']);
    expect(await names('sm-901')).toEqual(['SM-901']);
    expect(await names('quan den')).toEqual(['QT-901']);
    expect(await names('đen quần')).toEqual(['QT-901']);
    expect(await names('cotton')).toEqual(['SM-901']);
    expect(await names('oxford đen')).toEqual([]);
    expect(await names('%')).toEqual([]);
    expect(await names('_')).toEqual([]);
  });

  it('ranks phrase matches first and keeps two-letter words out of descriptions', async () => {
    await make({ code: 'KN-9', name: 'Áo len cổ tròn', description: 'Mềm mịn, sợi len, phù hợp mùa lạnh', categoryId: pants });
    await make({ code: 'SM-9', name: 'Áo sơ mi Oxford', description: 'Dễ mặc' });
    const codes = async (q: string, sort = 'newest') => (await list({ q, sort })).items.map((item) => item.code);
    expect(await codes('ao so mi')).toEqual(['SM-9']);
    expect(await codes('áo')).toEqual(['SM-9', 'KN-9'].sort((a, b) => (a === 'SM-9' ? -1 : b === 'SM-9' ? 1 : 0)));
    expect(await codes('len')).toEqual(['KN-9']);
    expect(await codes('mem')).toEqual(['KN-9']);
  });

  it('filters by category, price range, stock and sale, and sorts', async () => {
    await make({ code: 'P-1', name: 'Beta', priceVnd: 300000 });
    await make({ code: 'P-2', name: 'Alpha', priceVnd: 500000, compareAtPriceVnd: 700000 });
    await make({ code: 'P-3', name: 'Gamma', priceVnd: 900000, variants: [v('M', 'Đen', 0)] });
    await make({ code: 'Q-1', name: 'Delta', priceVnd: 100000, categoryId: pants });
    const codes = async (query: Record<string, unknown>) => (await list(query)).items.map((item) => item.code);

    expect(await codes({ category: 'quan' })).toEqual(['Q-1']);
    expect(await codes({ minPrice: 300000, maxPrice: 500000, sort: 'price_asc' })).toEqual(['P-1', 'P-2']);
    expect(await codes({ inStock: 'true', category: 'ao-so-mi', sort: 'name' })).toEqual(['P-2', 'P-1']);
    expect(await codes({ onSale: 'true' })).toEqual(['P-2']);
    expect(await codes({ sort: 'price_desc' })).toEqual(['P-3', 'P-2', 'P-1', 'Q-1']);
    expect(await codes({ sort: 'name' })).toEqual(['P-2', 'P-1', 'Q-1', 'P-3']);
  });

  it('paginates with a correct total and page count', async () => {
    for (const code of ['A-1', 'A-2', 'A-3', 'A-4', 'A-5']) await make({ code, name: code });
    const second = await list({ pageSize: 2, page: 2, sort: 'name' });
    expect(second).toMatchObject({ total: 5, pageCount: 3, page: 2 });
    expect(second.items.map((item) => item.code)).toEqual(['A-3', 'A-4']);
    expect((await list({ pageSize: 2, page: 9 })).items).toEqual([]);
  });

  it('builds cards with in-stock sizes in order, sold-out / low-stock flags and the cover image', async () => {
    const shirt = await make({ code: 'C-1', variants: [v('S', 'Trắng', 0), v('M', 'Trắng', 20), v('L', 'Trắng', 20), v('XL', 'Xanh', 20, false)] });
    await make({ code: 'C-2', variants: [v('M', 'Đen', 0)] });
    await make({ code: 'C-3', variants: [v('M', 'Đen', 2), v('L', 'Đen', 2)] });
    await admin.addProductImage(shirt.id, `products/${shirt.id}/b.jpg`);
    await admin.addProductImage(shirt.id, `products/${shirt.id}/a.jpg`);

    const cards = Object.fromEntries((await list()).items.map((item) => [item.code, item]));
    expect(cards['C-1']).toMatchObject({ sizes: ['M', 'L'], soldOut: false, lowStock: false, imageUrl: `/api/media/products/${shirt.id}/b.jpg` });
    expect(cards['C-2']).toMatchObject({ sizes: [], soldOut: true, lowStock: false, imageUrl: null });
    expect(cards['C-3']).toMatchObject({ soldOut: false, lowStock: true });
    expect(cards['C-1'].isNew).toBe(true);
  });

  it('returns product detail with active variants only, unique sizes/colours, images and related items', async () => {
    const main = await make({ code: 'D-1', name: 'Chính', variants: [v('M', 'Trắng', 5), v('L', 'Trắng', 0), v('M', 'Đen', 3), v('XL', 'Đen', 9, false)] });
    await make({ code: 'D-2', name: 'Cùng loại' });
    await make({ code: 'D-3', name: 'Khác loại', categoryId: pants });
    const detail = await store.getStoreProduct(main.slug);
    expect(detail).toMatchObject({ code: 'D-1', categorySlug: 'ao-so-mi', sizes: ['M', 'L'], colors: ['Trắng', 'Đen'], soldOut: false });
    expect(detail.variants).toHaveLength(3);
    expect((await store.listRelatedProducts('ao-so-mi', main.id)).map((item) => item.code)).toEqual(['D-2']);
    expect((await store.getStoreProduct(main.slug)).soldOut).toBe(false);
  });

  it('reports a sold-out detail page when no variant has stock', async () => {
    const out = await make({ code: 'E-1', variants: [v('M', 'Đen', 0)] });
    expect(await store.getStoreProduct(out.slug)).toMatchObject({ soldOut: true });
  });
});
