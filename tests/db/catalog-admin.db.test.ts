import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs against a real Postgres (pgvector) database, e.g.
 *   TEST_DATABASE_URL=postgres://fashion:fashion@db:5432/fashion_test pnpm test
 * Skipped when the variable is not set so `pnpm test` stays self-contained.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('catalog admin repository (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let repo: typeof import('@/features/catalog/admin-repository');
  let chunks: typeof import('@/features/catalog/chunks');
  let categoryId: string;

  const productChunks = async () => (await chunks.buildCatalogChunks()).filter((chunk) => chunk.sourceType === 'product');
  const variants = [{ size: 'M', color: 'Trắng', stock: 5, isActive: true }, { size: 'L', color: 'Trắng', stock: 3, isActive: true }];
  const product = (overrides: Record<string, unknown> = {}) => ({
    code: 'SM-900', name: 'Áo thử nghiệm', categoryId, description: '', material: '', priceVnd: 400000, compareAtPriceVnd: null, status: 'active' as const, variants, ...overrides,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations();
    repo = await import('@/features/catalog/admin-repository');
    chunks = await import('@/features/catalog/chunks');
  });
  afterAll(async () => { await sql?.end(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products, knowledge_documents, audit_logs CASCADE`;
    categoryId = (await repo.createCategory({ name: 'Áo thử', description: '', sortOrder: 0, isActive: true })).id;
  });

  it('creates a product with ordered variants, a stable slug and queues one catalog re-index', async () => {
    const created = await repo.createProduct(product());
    expect(created).toMatchObject({ code: 'SM-900', slug: 'ao-thu-nghiem-sm-900', categoryName: 'Áo thử' });
    expect(created.variants.map((variant) => variant.size)).toEqual(['M', 'L']);
    await repo.updateProduct(created.id, { ...product(), priceVnd: 390000 });
    const [{ pending }] = await sql<{ pending: number }[]>`SELECT count(*)::int AS pending FROM ingestion_jobs WHERE status = 'pending'`;
    expect(pending).toBe(1);
  });

  it('rejects a duplicate code, including one belonging to a deleted product', async () => {
    const created = await repo.createProduct(product());
    await expect(repo.createProduct(product())).rejects.toMatchObject({ status: 409 });
    await repo.softDeleteProduct(created.id);
    await expect(repo.createProduct(product())).rejects.toMatchObject({ status: 409 });
  });

  it('treats the variants payload as the full matrix: upsert listed, deactivate unlisted, keep rows', async () => {
    const created = await repo.createProduct(product());
    const updated = await repo.updateProduct(created.id, product({ variants: [{ size: 'M', color: 'Trắng', stock: 9, isActive: true }, { size: 'XL', color: 'Trắng', stock: 2, isActive: true }] }));
    const bySize = Object.fromEntries(updated.variants.map((variant) => [variant.size, variant]));
    expect(bySize.M.stock).toBe(9);
    expect(bySize.L.isActive).toBe(false);
    expect(bySize.XL.stock).toBe(2);
    expect(updated.variants).toHaveLength(3);
  });

  it('leaves variants untouched when the payload omits them', async () => {
    const created = await repo.createProduct(product());
    const { variants: _omit, ...withoutVariants } = product({ name: 'Tên mới' });
    const updated = await repo.updateProduct(created.id, withoutVariants);
    expect(updated.name).toBe('Tên mới');
    expect(updated.variants.map((variant) => variant.stock)).toEqual([5, 3]);
  });

  it('rolls the whole update back when an active product would have no sellable variant', async () => {
    const created = await repo.createProduct(product());
    const { variants: _omit, ...rest } = product({ priceVnd: 1, status: 'active' });
    await sql`UPDATE product_variants SET is_active = false WHERE product_id = ${created.id}`;
    await expect(repo.updateProduct(created.id, rest)).rejects.toMatchObject({ status: 400 });
    expect((await repo.getProductDetail(created.id)).priceVnd).toBe(400000);
  });

  it('refuses to delete a category that still has products, even soft-deleted ones', async () => {
    const created = await repo.createProduct(product());
    await expect(repo.deleteCategory(categoryId)).rejects.toMatchObject({ status: 409 });
    await repo.softDeleteProduct(created.id);
    await expect(repo.deleteCategory(categoryId)).rejects.toMatchObject({ status: 409 });
    const empty = await repo.createCategory({ name: 'Trống', description: '', sortOrder: 1, isActive: true });
    await repo.deleteCategory(empty.id);
    expect((await repo.listCategories()).map((category) => category.name)).not.toContain('Trống');
  });

  it('soft-deleted products disappear from lists, detail and the RAG source', async () => {
    const created = await repo.createProduct(product());
    expect((await productChunks()).map((chunk) => chunk.sourceId)).toEqual(['product:SM-900']);
    await repo.softDeleteProduct(created.id);
    expect((await repo.listProducts({ page: 1, pageSize: 20 })).total).toBe(0);
    await expect(repo.getProductDetail(created.id)).rejects.toMatchObject({ status: 404 });
    expect(await productChunks()).toEqual([]);
  });

  it('only indexes active products in visible categories', async () => {
    await repo.createProduct(product({ code: 'DR-1', status: 'draft' }));
    await repo.createProduct(product({ code: 'OK-1' }));
    const hidden = await repo.createCategory({ name: 'Ẩn', description: '', sortOrder: 2, isActive: false });
    await repo.createProduct(product({ code: 'HID-1', categoryId: hidden.id }));
    expect((await productChunks()).map((chunk) => chunk.sourceId)).toEqual(['product:OK-1']);
  });

  it('filters, searches (LIKE wildcards are literal) and paginates', async () => {
    for (const [index, code] of ['A-1', 'A-2', 'B-1'].entries()) await repo.createProduct(product({ code, name: `Áo ${code}`, status: index === 2 ? 'draft' : 'active' }));
    expect((await repo.listProducts({ page: 1, pageSize: 20, q: 'a-' })).total).toBe(2);
    expect((await repo.listProducts({ page: 1, pageSize: 20, q: 'áo b' })).total).toBe(1);
    expect((await repo.listProducts({ page: 1, pageSize: 20, q: '%' })).total).toBe(0);
    expect((await repo.listProducts({ page: 1, pageSize: 20, status: 'draft' })).items.map((item) => item.code)).toEqual(['B-1']);
    const page = await repo.listProducts({ page: 2, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, pageCount: 2 });
    expect(page.items).toHaveLength(1);
    expect((await repo.listProducts({ page: 1, pageSize: 20 })).items[0]).toMatchObject({ stockTotal: 8, variantCount: 2 });
  });

  it('caps images, reorders them and rejects an order that does not match', async () => {
    const created = await repo.createProduct(product());
    const added = [];
    for (let index = 0; index < 8; index += 1) added.push(await repo.addProductImage(created.id, `products/${created.id}/img-${index}.jpg`));
    await expect(repo.addProductImage(created.id, 'products/x/9.jpg')).rejects.toMatchObject({ status: 400 });
    const order = added.map((image) => image.id).reverse();
    await repo.reorderProductImages(created.id, order);
    expect((await repo.getProductDetail(created.id)).images.map((image) => image.id)).toEqual(order);
    await expect(repo.reorderProductImages(created.id, order.slice(1))).rejects.toMatchObject({ status: 400 });
    expect(await repo.deleteProductImage(created.id, order[0])).toContain('img-7.jpg');
    await expect(repo.deleteProductImage(created.id, order[0])).rejects.toMatchObject({ status: 404 });
  });
});
