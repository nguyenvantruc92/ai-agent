import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '@/db/client';
import { invalidateCategoryNames } from '@/features/catalog/category-names';
import { queueCatalogReindex } from '@/features/catalog/sync';
import { importStock, parseCatalogWorkbook } from '@/features/catalog/xlsx';
import { slugify } from '@/lib/slug';

export const seedCatalogFile = join(process.cwd(), 'data', 'raw', 'bang_gia_san_pham_thoi_trang_nam.xlsx');

export type ImportSummary = { products: number; created: number; updated: number; categories: number; variants: number };

/**
 * Upserts the spreadsheet into categories/products/variants, then queues a RAG re-index.
 * Existing variants keep their stock (a re-import must not reset what staff have counted);
 * prices, names and descriptions follow the sheet.
 */
export async function importCatalog(buffer: Buffer): Promise<ImportSummary & { reindexQueued: boolean }> {
  const rows = parseCatalogWorkbook(buffer);
  const summary: ImportSummary = { products: rows.length, created: 0, updated: 0, categories: 0, variants: 0 };

  await sql.begin(async (tx) => {
    const categoryIds = new Map<string, string>();
    for (const row of rows) {
      if (categoryIds.has(row.category)) continue;
      const [category] = await tx<{ id: string; inserted: boolean }[]>`
        INSERT INTO categories (id, slug, name, sort_order)
        VALUES (${randomUUID()}, ${slugify(row.category)}, ${row.category}, ${categoryIds.size})
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, (xmax = 0) AS inserted
      `;
      categoryIds.set(row.category, category.id);
      if (category.inserted) summary.categories += 1;
    }

    for (const row of rows) {
      const [product] = await tx<{ id: string; inserted: boolean }[]>`
        INSERT INTO products (id, code, slug, category_id, name, description, material, price_vnd, status, updated_at)
        VALUES (${randomUUID()}, ${row.code}, ${`${slugify(row.name)}-${slugify(row.code)}`}, ${categoryIds.get(row.category)!},
          ${row.name}, ${row.description}, ${row.material}, ${row.priceVnd}, 'active', ${row.updatedAt}::timestamptz)
        ON CONFLICT (code) DO UPDATE SET
          category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
          material = EXCLUDED.material, price_vnd = EXCLUDED.price_vnd, deleted_at = NULL, updated_at = EXCLUDED.updated_at,
          compare_at_price_vnd = CASE WHEN products.compare_at_price_vnd > EXCLUDED.price_vnd THEN products.compare_at_price_vnd END
        RETURNING id, (xmax = 0) AS inserted
      `;
      if (product.inserted) summary.created += 1; else summary.updated += 1;

      const stock = importStock(row.stockStatus);
      let position = 0;
      for (const size of row.sizes) {
        for (const color of row.colors) {
          await tx`
            INSERT INTO product_variants (id, product_id, size, color, stock, position)
            VALUES (${randomUUID()}, ${product.id}, ${size}, ${color}, ${stock}, ${position})
            ON CONFLICT (product_id, size, color) DO UPDATE SET position = EXCLUDED.position, updated_at = now()
          `;
          position += 1;
          summary.variants += 1;
        }
      }
    }
  });

  invalidateCategoryNames();
  const { queued } = await queueCatalogReindex();
  return { ...summary, reindexQueued: queued };
}

/** First boot: load the bundled sample catalog when the shop has no products yet. Returns null if nothing was done. */
export async function seedCatalogIfEmpty() {
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM products`;
  if (count > 0) return null;
  let buffer: Buffer;
  try { buffer = await readFile(seedCatalogFile); }
  catch { return null; }
  return importCatalog(buffer);
}
