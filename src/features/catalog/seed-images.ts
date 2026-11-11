import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { sql } from '@/db/client';
import { detectImage, saveProductImage } from '@/features/catalog/images';
import { moveToTrash } from '@/features/knowledge/files';

export const seedImageDir = () => join(process.cwd(), 'data', 'seed', 'product-images');

/**
 * Gives the demo products their main image from data/seed/product-images/<CODE>.webp (or .png/.jpg) and returns how many were
 * added or replaced. Safe to run on every `db:seed`:
 *  - a product with no image gets the seed image;
 *  - an image this seed created (seed_hash set) is replaced when the file changed, so new photos reach existing environments;
 *  - a main image from before seed_hash existed counts as ours only if its alt is still exactly the product name (that is what the
 *    seed wrote, and the admin upload leaves alt empty), so it is replaced once and tagged;
 *  - any other main image, such as one an admin uploaded, is never replaced. The replaced file goes to data/trash.
 */
export async function seedProductImages(dir = seedImageDir()) {
  let files: string[];
  try { files = await readdir(dir); } catch { return 0; }
  let changed = 0;
  for (const file of files.sort()) {
    const ext = extname(file).toLowerCase();
    if (!['.webp', '.png', '.jpg'].includes(ext)) continue;
    const [product] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM products WHERE code = ${basename(file, extname(file)).toUpperCase()} AND deleted_at IS NULL`;
    if (!product) continue;
    const [main] = await sql<{ id: string; storageKey: string; alt: string; seedHash: string | null }[]>`
      SELECT id, storage_key AS "storageKey", alt, seed_hash AS "seedHash" FROM product_images
      WHERE product_id = ${product.id} ORDER BY sort_order, created_at LIMIT 1`;
    const bytes = await readFile(join(dir, file));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (main && (main.seedHash === hash || (main.seedHash === null && main.alt !== product.name))) continue;
    const key = await saveProductImage(product.id, detectImage(bytes).ext, bytes);
    if (main) {
      await sql`UPDATE product_images SET storage_key = ${key}, alt = ${product.name}, seed_hash = ${hash} WHERE id = ${main.id}`;
      await moveToTrash(main.storageKey).catch(() => undefined);
    } else {
      await sql`INSERT INTO product_images (id, product_id, storage_key, alt, sort_order, seed_hash) VALUES (gen_random_uuid(), ${product.id}, ${key}, ${product.name}, 0, ${hash})`;
    }
    changed += 1;
  }
  return changed;
}
