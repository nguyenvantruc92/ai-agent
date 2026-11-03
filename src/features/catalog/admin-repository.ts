import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from '@/db/client';
import type { CategoryInput, ProductCreateInput, ProductListQuery, ProductUpdateInput, VariantInput } from '@/features/catalog/schemas';
import { MAX_IMAGES_PER_PRODUCT, imageUrl } from '@/features/catalog/images';
import { syncCatalog } from '@/features/catalog/sync';
import { audit } from '@/features/orders/repository';
import { HttpError } from '@/lib/http';
import { slugify } from '@/lib/slug';

const actor = 'admin';

export type CategoryRow = { id: string; slug: string; name: string; description: string; sortOrder: number; isActive: boolean; productCount: number };
export type ProductStatus = 'draft' | 'active' | 'archived';
export type ProductListItem = {
  id: string; code: string; slug: string; name: string; categoryId: string; categoryName: string;
  priceVnd: number; compareAtPriceVnd: number | null; status: ProductStatus; stockTotal: number; variantCount: number;
  imageUrl: string | null; updatedAt: string;
};
export type VariantRow = { id: string; size: string; color: string; stock: number; isActive: boolean };
export type ImageRow = { id: string; url: string; alt: string; sortOrder: number };
export type ProductDetail = Omit<ProductListItem, 'stockTotal' | 'variantCount' | 'imageUrl'> & { description: string; material: string; variants: VariantRow[]; images: ImageRow[] };

/* ───────── categories ───────── */

const categoryColumns = sql`c.id, c.slug, c.name, c.description, c.sort_order AS "sortOrder", c.is_active AS "isActive",
  (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS "productCount"`;

export const listCategories = () => sql<CategoryRow[]>`SELECT ${categoryColumns} FROM categories c ORDER BY c.sort_order, c.name`;

async function getCategory(id: string) {
  const [row] = await sql<CategoryRow[]>`SELECT ${categoryColumns} FROM categories c WHERE c.id = ${id}`;
  if (!row) throw new HttpError('Không tìm thấy danh mục.', 404);
  return row;
}

export async function createCategory(input: CategoryInput) {
  const id = randomUUID();
  const slug = input.slug ?? slugify(input.name);
  const [existing] = await sql`SELECT 1 FROM categories WHERE slug = ${slug} OR lower(name) = lower(${input.name})`;
  if (existing) throw new HttpError('Tên hoặc slug danh mục đã tồn tại.', 409);
  await sql`INSERT INTO categories (id, slug, name, description, sort_order, is_active) VALUES (${id}, ${slug}, ${input.name}, ${input.description}, ${input.sortOrder}, ${input.isActive})`;
  await audit(actor, 'category.create', 'category', id, { name: input.name });
  await syncCatalog();
  return getCategory(id);
}

export async function updateCategory(id: string, input: CategoryInput) {
  const current = await getCategory(id);
  const slug = input.slug ?? current.slug;
  const [clash] = await sql`SELECT 1 FROM categories WHERE id <> ${id} AND (slug = ${slug} OR lower(name) = lower(${input.name}))`;
  if (clash) throw new HttpError('Tên hoặc slug danh mục đã tồn tại.', 409);
  await sql`
    UPDATE categories SET slug = ${slug}, name = ${input.name}, description = ${input.description},
      sort_order = ${input.sortOrder}, is_active = ${input.isActive}, updated_at = now()
    WHERE id = ${id}
  `;
  await audit(actor, 'category.update', 'category', id, { name: input.name, isActive: input.isActive });
  await syncCatalog();
  return getCategory(id);
}

export async function deleteCategory(id: string) {
  const current = await getCategory(id);
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM products WHERE category_id = ${id}`;
  if (count > 0) throw new HttpError(`Danh mục còn ${count} sản phẩm. Hãy chuyển sản phẩm sang danh mục khác hoặc chỉ ẩn danh mục.`, 409);
  await sql`DELETE FROM categories WHERE id = ${id}`;
  await audit(actor, 'category.delete', 'category', id, { name: current.name });
  await syncCatalog();
}

/* ───────── products ───────── */

const likeEscape = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function listProducts(query: ProductListQuery) {
  const conditions = [sql`p.deleted_at IS NULL`];
  if (query.q) { const pattern = `%${likeEscape(query.q)}%`; conditions.push(sql`(p.name ILIKE ${pattern} OR p.code ILIKE ${pattern})`); }
  if (query.categoryId) conditions.push(sql`p.category_id = ${query.categoryId}`);
  if (query.status) conditions.push(sql`p.status = ${query.status}`);
  const where = conditions.reduce((all, part) => sql`${all} AND ${part}`);

  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM products p WHERE ${where}`;
  const rows = await sql<(Omit<ProductListItem, 'imageUrl'> & { imageKey: string | null })[]>`
    SELECT p.id, p.code, p.slug, p.name, p.category_id AS "categoryId", c.name AS "categoryName",
      p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd", p.status, p.updated_at AS "updatedAt",
      coalesce((SELECT sum(v.stock) FROM product_variants v WHERE v.product_id = p.id AND v.is_active), 0)::int AS "stockTotal",
      (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS "variantCount",
      (SELECT i.storage_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS "imageKey"
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${where}
    ORDER BY p.updated_at DESC, p.code
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
  `;
  const items: ProductListItem[] = rows.map(({ imageKey, ...row }) => ({ ...row, imageUrl: imageKey ? imageUrl(imageKey) : null, updatedAt: new Date(row.updatedAt).toISOString() }));
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getProductDetail(id: string): Promise<ProductDetail> {
  const [row] = await sql<Omit<ProductDetail, 'variants' | 'images'>[]>`
    SELECT p.id, p.code, p.slug, p.name, p.category_id AS "categoryId", c.name AS "categoryName", p.description, p.material,
      p.price_vnd AS "priceVnd", p.compare_at_price_vnd AS "compareAtPriceVnd", p.status, p.updated_at AS "updatedAt"
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.id = ${id} AND p.deleted_at IS NULL
  `;
  if (!row) throw new HttpError('Không tìm thấy sản phẩm.', 404);
  const [variants, images] = await Promise.all([
    sql<VariantRow[]>`SELECT id, size, color, stock, is_active AS "isActive" FROM product_variants WHERE product_id = ${id} ORDER BY position, size, color`,
    sql<{ id: string; storageKey: string; alt: string; sortOrder: number }[]>`SELECT id, storage_key AS "storageKey", alt, sort_order AS "sortOrder" FROM product_images WHERE product_id = ${id} ORDER BY sort_order, created_at`,
  ]);
  return { ...row, updatedAt: new Date(row.updatedAt).toISOString(), variants, images: images.map((image) => ({ id: image.id, url: imageUrl(image.storageKey), alt: image.alt, sortOrder: image.sortOrder })) };
}

async function assertCategory(tx: TransactionSql, categoryId: string) {
  const [category] = await tx`SELECT 1 FROM categories WHERE id = ${categoryId}`;
  if (!category) throw new HttpError('Danh mục không tồn tại.', 400);
}

async function insertVariants(tx: TransactionSql, productId: string, variants: VariantInput[]) {
  for (const [position, variant] of variants.entries()) {
    await tx`
      INSERT INTO product_variants (id, product_id, size, color, stock, position, is_active)
      VALUES (${randomUUID()}, ${productId}, ${variant.size}, ${variant.color}, ${variant.stock}, ${position}, ${variant.isActive})
      ON CONFLICT (product_id, size, color) DO UPDATE SET
        stock = EXCLUDED.stock, position = EXCLUDED.position, is_active = EXCLUDED.is_active, updated_at = now()
    `;
  }
}

export async function createProduct(input: ProductCreateInput) {
  const id = randomUUID();
  await sql.begin(async (tx) => {
    const [taken] = await tx`SELECT 1 FROM products WHERE code = ${input.code}`;
    if (taken) throw new HttpError(`Mã sản phẩm ${input.code} đã tồn tại (kể cả sản phẩm đã xóa).`, 409);
    await assertCategory(tx, input.categoryId);
    await tx`
      INSERT INTO products (id, code, slug, category_id, name, description, material, price_vnd, compare_at_price_vnd, status)
      VALUES (${id}, ${input.code}, ${`${slugify(input.name)}-${slugify(input.code)}`}, ${input.categoryId}, ${input.name},
        ${input.description}, ${input.material}, ${input.priceVnd}, ${input.compareAtPriceVnd}, ${input.status})
    `;
    await insertVariants(tx, id, input.variants ?? []);
  });
  await audit(actor, 'product.create', 'product', id, { code: input.code, status: input.status });
  await syncCatalog();
  return getProductDetail(id);
}

/**
 * Variants in the payload become the full matrix: listed ones are upserted with the given stock,
 * unlisted ones are deactivated (never deleted, so order history keeps its references).
 * Stock here is an absolute count set by staff; checkout decrements it atomically elsewhere.
 */
export async function updateProduct(id: string, input: ProductUpdateInput) {
  await sql.begin(async (tx) => {
    const [current] = await tx`SELECT 1 FROM products WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
    if (!current) throw new HttpError('Không tìm thấy sản phẩm.', 404);
    await assertCategory(tx, input.categoryId);
    await tx`
      UPDATE products SET category_id = ${input.categoryId}, name = ${input.name}, description = ${input.description}, material = ${input.material},
        price_vnd = ${input.priceVnd}, compare_at_price_vnd = ${input.compareAtPriceVnd}, status = ${input.status}, updated_at = now()
      WHERE id = ${id}
    `;
    if (input.variants) {
      await insertVariants(tx, id, input.variants);
      const kept = new Set(input.variants.map((variant) => `${variant.size}\u0000${variant.color}`));
      const existing = await tx<{ id: string; size: string; color: string }[]>`SELECT id, size, color FROM product_variants WHERE product_id = ${id}`;
      const dropped = existing.filter((variant) => !kept.has(`${variant.size}\u0000${variant.color}`)).map((variant) => variant.id);
      if (dropped.length) await tx`UPDATE product_variants SET is_active = false, updated_at = now() WHERE id IN ${tx(dropped)}`;
    }
    if (input.status === 'active') {
      const [{ count }] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM product_variants WHERE product_id = ${id} AND is_active`;
      if (count === 0) throw new HttpError('Sản phẩm đang bán cần ít nhất một biến thể.', 400);
    }
  });
  await audit(actor, 'product.update', 'product', id, { status: input.status, priceVnd: input.priceVnd });
  await syncCatalog();
  return getProductDetail(id);
}

export async function softDeleteProduct(id: string) {
  const rows = await sql`UPDATE products SET deleted_at = now(), updated_at = now() WHERE id = ${id} AND deleted_at IS NULL RETURNING code`;
  if (!rows.length) throw new HttpError('Không tìm thấy sản phẩm.', 404);
  await audit(actor, 'product.delete', 'product', id, { code: rows[0].code });
  await syncCatalog();
}

/* ───────── images ───────── */

export async function addProductImage(productId: string, storageKey: string, alt = '') {
  const [product] = await sql`SELECT 1 FROM products WHERE id = ${productId} AND deleted_at IS NULL`;
  if (!product) throw new HttpError('Không tìm thấy sản phẩm.', 404);
  const [{ count, next }] = await sql<{ count: number; next: number }[]>`SELECT count(*)::int AS count, coalesce(max(sort_order), -1) + 1 AS next FROM product_images WHERE product_id = ${productId}`;
  if (count >= MAX_IMAGES_PER_PRODUCT) throw new HttpError(`Mỗi sản phẩm tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh.`, 400);
  const id = randomUUID();
  await sql`INSERT INTO product_images (id, product_id, storage_key, alt, sort_order) VALUES (${id}, ${productId}, ${storageKey}, ${alt}, ${next})`;
  await audit(actor, 'product.image_add', 'product', productId, { imageId: id });
  return { id, url: imageUrl(storageKey), alt, sortOrder: next };
}

export async function deleteProductImage(productId: string, imageId: string) {
  const rows = await sql<{ storage_key: string }[]>`DELETE FROM product_images WHERE id = ${imageId} AND product_id = ${productId} RETURNING storage_key`;
  if (!rows.length) throw new HttpError('Không tìm thấy ảnh.', 404);
  await audit(actor, 'product.image_delete', 'product', productId, { imageId });
  return rows[0].storage_key;
}

export async function reorderProductImages(productId: string, order: string[]) {
  const existing = await sql<{ id: string }[]>`SELECT id FROM product_images WHERE product_id = ${productId}`;
  const ids = new Set(existing.map((image) => image.id));
  if (order.length !== ids.size || order.some((id) => !ids.has(id)) || new Set(order).size !== order.length) {
    throw new HttpError('Danh sách ảnh không khớp với ảnh hiện có.', 400);
  }
  await sql.begin(async (tx) => {
    for (const [index, id] of order.entries()) await tx`UPDATE product_images SET sort_order = ${index} WHERE id = ${id}`;
  });
}
