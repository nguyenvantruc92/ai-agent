import { sql } from '@/db/client';
import { imageUrl } from '@/features/catalog/images';
import type { StoreListQuery } from '@/features/catalog/schemas';
import { LOW_STOCK_AVERAGE } from '@/features/catalog/stock';
import { HttpError } from '@/lib/http';

/**
 * Read side of the public shop. Everything here only ever returns products that are
 * `active`, not deleted and inside a visible category: drafts and hidden categories never leak.
 */

export type StoreCategory = { id: string; slug: string; name: string; description: string; productCount: number };
export type StoreCard = {
  id: string; code: string; slug: string; name: string; categoryName: string; categorySlug: string;
  priceVnd: number; compareAtPriceVnd: number | null; imageUrl: string | null;
  sizes: string[]; colors: string[]; soldOut: boolean; lowStock: boolean; isNew: boolean;
};
export type StoreVariant = { id: string; size: string; color: string; stock: number };
export type StoreProduct = {
  id: string; code: string; slug: string; name: string; description: string; material: string;
  categoryName: string; categorySlug: string; priceVnd: number; compareAtPriceVnd: number | null;
  images: { id: string; url: string; alt: string }[]; variants: StoreVariant[]; sizes: string[]; colors: string[]; soldOut: boolean;
};

const NEW_DAYS = 30;
const likeEscape = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const visible = sql`p.status = 'active' AND p.deleted_at IS NULL AND c.is_active`;

export const listStoreCategories = () => sql<StoreCategory[]>`
  SELECT c.id, c.slug, c.name, c.description,
    (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL) AS "productCount"
  FROM categories c
  WHERE c.is_active
  ORDER BY c.sort_order, c.name
`;

type CardRow = Omit<StoreCard, 'imageUrl' | 'soldOut' | 'lowStock' | 'isNew'> & { imageKey: string | null; stock: number; variantCount: number; createdAt: Date };

const cardColumns = sql`
  p.id, p.code, p.slug, p.name, c.name AS "categoryName", c.slug AS "categorySlug",
  p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd", p.created_at AS "createdAt",
  (SELECT i.storage_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS "imageKey",
  coalesce((SELECT sum(v.stock) FROM product_variants v WHERE v.product_id = p.id AND v.is_active), 0)::int AS stock,
  (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS "variantCount",
  coalesce((SELECT array_agg(s.size ORDER BY s.pos) FROM (
    SELECT v.size, min(v.position) AS pos FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.stock > 0 GROUP BY v.size
  ) s), '{}') AS sizes,
  coalesce((SELECT array_agg(s.color ORDER BY s.pos) FROM (
    SELECT v.color, min(v.position) AS pos FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.stock > 0 GROUP BY v.color
  ) s), '{}') AS colors
`;

function toCard(row: CardRow): StoreCard {
  const { imageKey, stock, variantCount, createdAt, ...rest } = row;
  return {
    ...rest,
    imageUrl: imageKey ? imageUrl(imageKey) : null,
    soldOut: stock <= 0,
    lowStock: stock > 0 && variantCount > 0 && stock / variantCount <= LOW_STOCK_AVERAGE,
    isNew: Date.now() - new Date(createdAt).getTime() < NEW_DAYS * 86_400_000,
  };
}

const orderBy = {
  newest: sql`p.created_at DESC, p.code`,
  price_asc: sql`p.price_vnd ASC, p.code`,
  price_desc: sql`p.price_vnd DESC, p.code`,
  name: sql`unaccent(lower(p.name)) ASC, p.code`,
} as const;

const SHORT_WORD = 2;

/**
 * Every search word must match the name, code or category; words longer than two letters may also match the
 * description (two-letter words like "so" or "mi" would match almost any sentence). Case and accents are ignored.
 */
function searchConditions(q: string) {
  return q.split(/\s+/).filter(Boolean).slice(0, 5).map((word) => {
    const pattern = `%${likeEscape(word)}%`;
    const description = word.length > SHORT_WORD ? sql`OR unaccent(lower(p.description)) LIKE unaccent(lower(${pattern}))` : sql``;
    return sql`(unaccent(lower(p.name)) LIKE unaccent(lower(${pattern})) OR lower(p.code) LIKE lower(${pattern})
      OR unaccent(lower(c.name)) LIKE unaccent(lower(${pattern})) ${description})`;
  });
}

/** Products whose code, name or category contain the whole phrase come first. */
function relevance(q: string) {
  const phrase = `%${likeEscape(q.trim().replace(/\s+/g, ' '))}%`;
  return sql`(lower(p.code) LIKE lower(${phrase}))::int * 5 + (unaccent(lower(p.name)) LIKE unaccent(lower(${phrase})))::int * 4 + (unaccent(lower(c.name)) LIKE unaccent(lower(${phrase})))::int * 3`;
}

export async function listStoreProducts(query: StoreListQuery) {
  const conditions = [visible];
  if (query.category) conditions.push(sql`c.slug = ${query.category}`);
  if (query.q) conditions.push(...searchConditions(query.q));
  if (query.minPrice !== undefined) conditions.push(sql`p.price_vnd >= ${query.minPrice}`);
  if (query.maxPrice !== undefined) conditions.push(sql`p.price_vnd <= ${query.maxPrice}`);
  if (query.onSale) conditions.push(sql`p.compare_at_price_vnd IS NOT NULL`);
  if (query.inStock) conditions.push(sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.stock > 0)`);
  const where = conditions.reduce((all, part) => sql`${all} AND ${part}`);

  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${where}`;
  const rows = await sql<CardRow[]>`
    SELECT ${cardColumns} FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${where} ORDER BY ${query.q && query.sort === 'newest' ? sql`${relevance(query.q)} DESC, ${orderBy.newest}` : orderBy[query.sort]}
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
  `;
  return { items: rows.map(toCard), total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

/** Price bounds of the visible catalogue, used to hint the price filter. */
export async function storePriceRange(category?: string) {
  const [row] = await sql<{ min: number | null; max: number | null }[]>`
    SELECT min(p.price_vnd)::int AS min, max(p.price_vnd)::int AS max FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${visible} ${category ? sql`AND c.slug = ${category}` : sql``}`;
  return { min: row?.min ?? 0, max: row?.max ?? 0 };
}

export async function getStoreProduct(slug: string): Promise<StoreProduct> {
  const [row] = await sql<{ id: string; code: string; slug: string; name: string; description: string; material: string; categoryName: string; categorySlug: string; priceVnd: number; compareAtPriceVnd: number | null }[]>`
    SELECT p.id, p.code, p.slug, p.name, p.description, p.material, c.name AS "categoryName", c.slug AS "categorySlug",
      p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd"
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${visible} AND p.slug = ${slug}
  `;
  if (!row) throw new HttpError('Không tìm thấy sản phẩm.', 404);
  const [variants, images] = await Promise.all([
    sql<StoreVariant[]>`SELECT id, size, color, stock FROM product_variants WHERE product_id = ${row.id} AND is_active ORDER BY position, size, color`,
    sql<{ id: string; storageKey: string; alt: string }[]>`SELECT id, storage_key AS "storageKey", alt FROM product_images WHERE product_id = ${row.id} ORDER BY sort_order, created_at`,
  ]);
  const unique = (values: string[]) => [...new Set(values)];
  return {
    ...row,
    images: images.map((image) => ({ id: image.id, url: imageUrl(image.storageKey), alt: image.alt || row.name })),
    variants,
    sizes: unique(variants.map((variant) => variant.size)),
    colors: unique(variants.map((variant) => variant.color)),
    soldOut: !variants.some((variant) => variant.stock > 0),
  };
}

/** Other products from the same category, newest first. */
export async function listRelatedProducts(categorySlug: string, excludeId: string, limit = 4) {
  const rows = await sql<CardRow[]>`
    SELECT ${cardColumns} FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${visible} AND c.slug = ${categorySlug} AND p.id <> ${excludeId}
    ORDER BY p.created_at DESC, p.code LIMIT ${limit}
  `;
  return rows.map(toCard);
}
