import { stockStatus } from '@/features/catalog/stock';
import type { CatalogProduct, VariantRow } from '@/features/catalog/types';

type ProductRow = {
  code: string; name: string; category: string; description: string; material: string;
  price_vnd: number; compare_at_price_vnd: number | null; updated_at: Date | string;
};

const unique = (values: string[]) => [...new Set(values)];

/** Folds a product row and its active variants (already ordered by position) into the shape used by chat, MCP and RAG. */
export function toCatalogProduct(row: ProductRow, variants: VariantRow[]): CatalogProduct {
  const sellable = variants.filter((variant) => variant.stock > 0);
  const shown = sellable.length ? sellable : variants;
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description,
    material: row.material,
    priceVnd: row.price_vnd,
    compareAtPriceVnd: row.compare_at_price_vnd,
    sizes: unique(shown.map((variant) => variant.size)),
    colors: unique(shown.map((variant) => variant.color)),
    stockStatus: variants.length ? stockStatus(variants) : 'Hết hàng',
    updatedAt: new Date(row.updated_at).toISOString().slice(0, 10),
  };
}
