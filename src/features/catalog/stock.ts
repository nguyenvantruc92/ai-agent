export type StockStatus = 'Còn hàng' | 'Sắp hết hàng' | 'Hết hàng';

/** Average units per active variant at or below which a product counts as "sắp hết hàng". */
export const LOW_STOCK_AVERAGE = 5;

/**
 * Product-level label derived from variant stock. The exact strings matter: RAG
 * retrieval filters on them (rag/keywords.ts) and the exchange policy matches them.
 */
export function stockStatus(variants: { stock: number }[]): StockStatus {
  const total = variants.reduce((sum, variant) => sum + variant.stock, 0);
  if (total <= 0) return 'Hết hàng';
  return total / variants.length <= LOW_STOCK_AVERAGE ? 'Sắp hết hàng' : 'Còn hàng';
}
