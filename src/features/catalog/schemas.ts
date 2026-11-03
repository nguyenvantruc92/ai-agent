import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().max(max);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang.').max(80);

export const categoryInput = z.object({
  name: trimmed(80).min(1, 'Tên danh mục không được để trống.'),
  slug: slug.optional(),
  description: trimmed(500).default(''),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const variantInput = z.object({
  size: trimmed(20).min(1, 'Size không được để trống.'),
  color: trimmed(40).min(1, 'Màu không được để trống.'),
  stock: z.coerce.number().int('Tồn kho phải là số nguyên.').min(0, 'Tồn kho không được âm.').max(100_000),
  isActive: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInput>;

const productFields = {
  name: trimmed(160).min(1, 'Tên sản phẩm không được để trống.'),
  categoryId: z.string().uuid('Chọn danh mục.'),
  description: trimmed(2000).default(''),
  material: trimmed(200).default(''),
  priceVnd: z.coerce.number().int('Giá phải là số nguyên (VNĐ).').min(0).max(100_000_000),
  compareAtPriceVnd: z.coerce.number().int().min(0).max(100_000_000).nullish().transform((value) => value || null),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  variants: z.array(variantInput).max(100, 'Tối đa 100 biến thể.').optional(),
};

type ProductShape = { priceVnd: number; compareAtPriceVnd: number | null; status: string; variants?: VariantInput[] };

/** Rules that span several fields; shared by create and update. */
function crossChecks(value: ProductShape, ctx: z.RefinementCtx) {
  if (value.compareAtPriceVnd !== null && value.compareAtPriceVnd <= value.priceVnd) {
    ctx.addIssue({ code: 'custom', path: ['compareAtPriceVnd'], message: 'Giá gốc phải lớn hơn giá bán.' });
  }
  const seen = new Set<string>();
  for (const [index, variant] of (value.variants ?? []).entries()) {
    const key = `${variant.size.toLowerCase()}|${variant.color.toLowerCase()}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants', index], message: `Biến thể ${variant.size} / ${variant.color} bị trùng.` });
    seen.add(key);
  }
  if (value.status === 'active' && value.variants && !value.variants.some((variant) => variant.isActive)) {
    ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Sản phẩm đang bán cần ít nhất một biến thể.' });
  }
}

export const productCreateInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Mã gồm 2–20 ký tự: chữ, số, dấu gạch ngang.'),
  ...productFields,
}).superRefine(crossChecks);
export type ProductCreateInput = z.infer<typeof productCreateInput>;

/** Update keeps the code (immutable) out of the payload; `variants` omitted means "leave variants alone". */
export const productUpdateInput = z.object(productFields).superRefine(crossChecks);
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;

export const imageOrderInput = z.object({ order: z.array(z.string().uuid()).min(1).max(20) });

export const productListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductListQuery = z.infer<typeof productListQuery>;

/** Public storefront listing: category by slug, free-text search, price range and sort. */
export const storeListQuery = z.object({
  category: z.string().trim().toLowerCase().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  minPrice: z.coerce.number().int().min(0).max(100_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(100_000_000).optional(),
  inStock: z.preprocess((value) => value === 'true' || value === 'on' || value === '1' || value === true, z.boolean()).default(false),
  onSale: z.preprocess((value) => value === 'true' || value === 'on' || value === '1' || value === true, z.boolean()).default(false),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type StoreListQuery = z.infer<typeof storeListQuery>;
