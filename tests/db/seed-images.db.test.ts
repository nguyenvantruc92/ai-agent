import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Needs TEST_DATABASE_URL (see catalog-admin.db.test.ts); skipped otherwise. Uploads go to a temp dir, not data/uploads. */
const url = process.env.TEST_DATABASE_URL;
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('VP8L')]);

describe.skipIf(!url)('seedProductImages (Postgres)', () => {
  let sql: typeof import('@/db/client').sql;
  let admin: typeof import('@/features/catalog/admin-repository');
  let seed: typeof import('@/features/catalog/seed-images');
  let root: string;
  let dir: string;
  let categoryId: string;

  const product = (code: string, name: string) => admin.createProduct({
    code, name, categoryId, description: '', material: '', priceVnd: 300000, compareAtPriceVnd: null, status: 'active' as const,
    variants: [{ size: 'M', color: 'Đen', stock: 5, isActive: true }],
  } as never);

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'seed-images-'));
    process.env.DATABASE_URL = url;
    ({ sql } = await import('@/db/client'));
    await (await import('@/db/apply-migrations')).applyMigrations(); // migrations are found from the real cwd
    vi.spyOn(process, 'cwd').mockReturnValue(root); // uploadRoot is read from cwd when these modules load
    admin = await import('@/features/catalog/admin-repository');
    seed = await import('@/features/catalog/seed-images');
    dir = join(root, 'images');
  });
  afterAll(async () => { await sql?.end(); vi.restoreAllMocks(); });
  beforeEach(async () => {
    await sql`TRUNCATE categories, products CASCADE`;
    categoryId = (await admin.createCategory({ name: 'Áo', description: '', sortOrder: 0, isActive: true })).id;
    await mkdir(dir, { recursive: true });
  });

  it('adds the image to products that have none, by product code, and is safe to run again', async () => {
    await product('AO-1', 'Áo polo đen'); await product('AO-2', 'Áo len');
    await writeFile(join(dir, 'AO-1.webp'), webp);
    await writeFile(join(dir, 'ZZ-9.webp'), webp); // no such product
    await writeFile(join(dir, 'notes.txt'), 'ignored');
    expect(await seed.seedProductImages(dir)).toBe(1);
    const rows = await sql<{ code: string; storage_key: string; alt: string }[]>`SELECT p.code, i.storage_key, i.alt FROM product_images i JOIN products p ON p.id = i.product_id`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'AO-1', alt: 'Áo polo đen' });
    expect(rows[0].storage_key).toMatch(/^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    expect(await readFile(join(root, 'data', 'uploads', rows[0].storage_key))).toEqual(webp);
    expect(await seed.seedProductImages(dir)).toBe(0);
  });

  it('rejects files that are not images', async () => {
    await product('AO-1', 'Áo polo đen');
    await writeFile(join(dir, 'AO-1.webp'), Buffer.from('not an image'));
    await expect(seed.seedProductImages(dir)).rejects.toThrow(/JPG, PNG hoặc WebP/);
  });

  it('replaces an image the seed created when the seed file changes, and moves the old file to the trash', async () => {
    await product('AO-1', 'Áo polo đen');
    await writeFile(join(dir, 'AO-1.webp'), webp);
    expect(await seed.seedProductImages(dir)).toBe(1);
    const [before] = await sql<{ id: string; storage_key: string }[]>`SELECT id, storage_key FROM product_images`;
    await writeFile(join(dir, 'AO-1.webp'), Buffer.concat([webp, Buffer.from('x')]));
    expect(await seed.seedProductImages(dir)).toBe(1);
    const rows = await sql<{ id: string; storage_key: string; seed_hash: string }[]>`SELECT id, storage_key, seed_hash FROM product_images`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before.id);
    expect(rows[0].storage_key).not.toBe(before.storage_key);
    expect(await readFile(join(root, 'data', 'uploads', rows[0].storage_key))).toEqual(Buffer.concat([webp, Buffer.from('x')]));
    expect((await readdir(join(root, 'data', 'trash'))).some((name) => name.endsWith(before.storage_key.split('/').pop()!))).toBe(true);
    expect(await seed.seedProductImages(dir)).toBe(0);
  });

  it('replaces a main image from before seed_hash existed (alt is still the product name) once, then tags it', async () => {
    const created = await product('AO-1', 'Áo polo đen');
    await sql`INSERT INTO product_images (id, product_id, storage_key, alt, sort_order) VALUES (gen_random_uuid(), ${created.id}, ${`products/${created.id}/legacy.png`}, 'Áo polo đen', 0)`;
    await writeFile(join(dir, 'AO-1.webp'), webp);
    expect(await seed.seedProductImages(dir)).toBe(1);
    const rows = await sql<{ storage_key: string; seed_hash: string | null }[]>`SELECT storage_key, seed_hash FROM product_images`;
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_key).toMatch(/\.webp$/);
    expect(rows[0].seed_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await seed.seedProductImages(dir)).toBe(0);
  });

  it('never replaces an image an admin uploaded', async () => {
    const created = await product('AO-1', 'Áo polo đen');
    await admin.addProductImage(created.id, `products/${created.id}/admin.jpg`, '');
    await writeFile(join(dir, 'AO-1.webp'), webp);
    expect(await seed.seedProductImages(dir)).toBe(0);
    const rows = await sql<{ storage_key: string; seed_hash: string | null }[]>`SELECT storage_key, seed_hash FROM product_images`;
    expect(rows).toEqual([{ storage_key: `products/${created.id}/admin.jpg`, seed_hash: null }]);
  });

  it('does nothing when the seed folder does not exist', async () => {
    expect(await seed.seedProductImages(join(root, 'missing'))).toBe(0);
  });
});
