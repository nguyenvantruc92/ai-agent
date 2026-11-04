import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

  it('never replaces an image that already exists and rejects files that are not images', async () => {
    await product('AO-1', 'Áo polo đen');
    await writeFile(join(dir, 'AO-1.webp'), Buffer.from('not an image'));
    await expect(seed.seedProductImages(dir)).rejects.toThrow(/JPG, PNG hoặc WebP/);
    await writeFile(join(dir, 'AO-1.webp'), webp);
    expect(await seed.seedProductImages(dir)).toBe(1);
    await writeFile(join(dir, 'AO-1.webp'), Buffer.concat([webp, Buffer.from('x')]));
    expect(await seed.seedProductImages(dir)).toBe(0);
  });

  it('does nothing when the seed folder does not exist', async () => {
    expect(await seed.seedProductImages(join(root, 'missing'))).toBe(0);
  });
});
