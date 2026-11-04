import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { sql } from '@/db/client';
import { detectImage, saveProductImage } from '@/features/catalog/images';

export const seedImageDir = () => join(process.cwd(), 'data', 'seed', 'product-images');

/**
 * Gives the demo products their main image from data/seed/product-images/<CODE>.webp (or .png/.jpg). Only products that have no
 * image yet are touched, so it is safe to run on every `db:seed` and never replaces an image an admin uploaded.
 */
export async function seedProductImages(dir = seedImageDir()) {
  let files: string[];
  try { files = await readdir(dir); } catch { return 0; }
  let added = 0;
  for (const file of files.sort()) {
    const ext = extname(file).toLowerCase();
    if (!['.webp', '.png', '.jpg'].includes(ext)) continue;
    const [product] = await sql<{ id: string; name: string }[]>`
      SELECT p.id, p.name FROM products p
      WHERE p.code = ${basename(file, extname(file)).toUpperCase()} AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)`;
    if (!product) continue;
    const bytes = await readFile(join(dir, file));
    const format = detectImage(bytes);
    const key = await saveProductImage(product.id, format.ext, bytes);
    await sql`INSERT INTO product_images (id, product_id, storage_key, alt, sort_order) VALUES (gen_random_uuid(), ${product.id}, ${key}, ${product.name}, 0)`;
    added += 1;
  }
  return added;
}
