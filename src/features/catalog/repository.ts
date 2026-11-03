import { sql } from '@/db/client';
import { toCatalogProduct } from '@/features/catalog/summary';
import type { VariantRow } from '@/features/catalog/types';
import type { Product } from '@/features/orders/types';

/** Reads one sellable product with live stock, so the catalog tables stay the single source of truth. */
export async function findProduct(productId: string): Promise<Product | null> {
  const [row] = await sql<{ id: string; code: string; name: string; category: string; description: string; material: string; price_vnd: number; compare_at_price_vnd: number | null; updated_at: Date }[]>`
    SELECT p.id, p.code, p.name, c.name AS category, p.description, p.material, p.price_vnd, p.compare_at_price_vnd, p.updated_at
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.code = ${productId.trim().toUpperCase()} AND p.status = 'active' AND p.deleted_at IS NULL AND c.is_active
  `;
  if (!row) return null;
  const variants = await sql<VariantRow[]>`
    SELECT size, color, stock FROM product_variants WHERE product_id = ${row.id} AND is_active ORDER BY position, size, color
  `;
  const product = toCatalogProduct(row, variants);
  return {
    productId: product.code,
    name: product.name,
    category: product.category,
    priceVnd: product.priceVnd,
    sizes: product.sizes,
    colors: product.colors,
    stockStatus: product.stockStatus,
    updatedAt: product.updatedAt,
    variants: variants.map((variant) => ({ size: variant.size, color: variant.color, stock: variant.stock })),
  };
}
