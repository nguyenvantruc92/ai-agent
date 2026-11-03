import { createHash } from 'node:crypto';
import { sql } from '@/db/client';
import { toCatalogProduct } from '@/features/catalog/summary';
import type { CatalogProduct, VariantRow } from '@/features/catalog/types';
import type { ParsedChunk } from '@/features/knowledge/types';
import { getShopSettings, type ShopSettings } from '@/features/shop/settings';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const vnd = (value: number) => `${value.toLocaleString('vi-VN')} VNĐ`;

/** One RAG chunk per product. Field labels and metadata keys are what retrieval filters and prompts rely on. */
export function buildProductChunk(product: CatalogProduct): ParsedChunk {
  const sizes = product.sizes.join(', ');
  const colors = product.colors.join(', ');
  const content = [
    `[Mã: ${product.code}]`,
    `Tên sản phẩm: ${product.name}`,
    `Danh mục: ${product.category}`,
    `Giá: ${vnd(product.priceVnd)}`,
    ...(product.compareAtPriceVnd ? [`Giá gốc: ${vnd(product.compareAtPriceVnd)}`] : []),
    `Mô tả: ${product.description}`,
    `Size: ${sizes}`,
    `Màu: ${colors}`,
    `Chất liệu: ${product.material}`,
    `Tình trạng: ${product.stockStatus}`,
    `Cập nhật: ${product.updatedAt}`,
  ].join('\n');
  return {
    sourceId: `product:${product.code}`,
    sourceType: 'product',
    title: product.name,
    content,
    metadata: {
      product_id: product.code,
      category: product.category,
      updated_at: product.updatedAt,
      price_vnd: product.priceVnd,
      stock_status: product.stockStatus,
      sizes: product.sizes,
      colors: product.colors,
    },
    contentHash: hash(content),
  };
}

/** Active, non-deleted products in an active category, with their live variant stock. */
export async function loadSellableProducts(): Promise<CatalogProduct[]> {
  const products = await sql<(Parameters<typeof toCatalogProduct>[0] & { id: string })[]>`
    SELECT p.id, p.code, p.name, c.name AS category, p.description, p.material, p.price_vnd, p.compare_at_price_vnd, p.updated_at
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' AND p.deleted_at IS NULL AND c.is_active
    ORDER BY c.sort_order, p.code
  `;
  if (!products.length) return [];
  const variants = await sql<(VariantRow & { product_id: string })[]>`
    SELECT product_id, size, color, stock FROM product_variants
    WHERE product_id IN ${sql(products.map((product) => product.id))} AND is_active
    ORDER BY position, size, color
  `;
  return products.map((product) => toCatalogProduct(product, variants.filter((variant) => variant.product_id === product.id)));
}

/**
 * The live shipping numbers as a policy chunk, so the chatbot quotes the same fee and threshold the
 * checkout charges. (The FAQ PDF is static; settings are the source of truth.)
 */
export function buildShippingChunk(settings: Pick<ShopSettings, 'shippingFeeVnd' | 'freeShippingFromVnd'>, updatedAt: string): ParsedChunk {
  const question = 'Phí giao hàng hiện hành là bao nhiêu? Ngưỡng miễn phí giao hàng là bao nhiêu?';
  const content = `[Nguồn: Phí giao hàng hiện hành]\nCâu hỏi: ${question}\nThông tin: Đơn hàng từ ${vnd(settings.freeShippingFromVnd)} được miễn phí giao hàng toàn quốc; đơn dưới ${vnd(settings.freeShippingFromVnd)} có phí giao hàng tiêu chuẩn ${vnd(settings.shippingFeeVnd)}.`;
  return {
    sourceId: 'policy:phi-giao-hang-hien-hanh:1', sourceType: 'policy', title: `Phí giao hàng hiện hành — ${question}`, content,
    metadata: { section: 'phi-giao-hang-hien-hanh', question, page: null, updated_at: updatedAt }, contentHash: hash(content),
  };
}

export async function buildCatalogChunks(): Promise<ParsedChunk[]> {
  const [products, settings] = await Promise.all([loadSellableProducts(), getShopSettings()]);
  return [...products.map(buildProductChunk), buildShippingChunk(settings, (settings.updatedAt ?? new Date().toISOString()).slice(0, 10))];
}
