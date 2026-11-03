import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { detectImage } from '@/features/catalog/images';
import { categoryInput, imageOrderInput, productCreateInput, productListQuery, productUpdateInput } from '@/features/catalog/schemas';
import { HttpError, apiError } from '@/lib/http';

const categoryId = '3f6f1c0e-8d3a-4b52-9c1e-6a3f2b1d0e11';
const valid = { code: 'sm-010', name: 'Áo sơ mi', categoryId, priceVnd: 499000, status: 'active', variants: [{ size: 'M', color: 'Trắng', stock: 5 }] };

describe('productCreateInput', () => {
  it('upper-cases the code and applies defaults', () => {
    const parsed = productCreateInput.parse(valid);
    expect(parsed.code).toBe('SM-010');
    expect(parsed).toMatchObject({ description: '', compareAtPriceVnd: null });
    expect(parsed.variants?.[0].isActive).toBe(true);
  });

  it.each([
    ['bad code', { code: 'a b' }, 'Mã'],
    ['negative price', { priceVnd: -1 }, 'priceVnd'],
    ['fractional price', { priceVnd: 10.5 }, 'số nguyên'],
    ['compare price not above price', { compareAtPriceVnd: 499000 }, 'Giá gốc'],
    ['duplicate variants ignoring case', { variants: [{ size: 'M', color: 'Trắng', stock: 1 }, { size: 'm', color: 'trắng', stock: 2 }] }, 'trùng'],
    ['negative stock', { variants: [{ size: 'M', color: 'Trắng', stock: -3 }] }, 'không được âm'],
    ['active without sellable variants', { variants: [{ size: 'M', color: 'Trắng', stock: 1, isActive: false }] }, 'ít nhất một biến thể'],
    ['not a category id', { categoryId: 'abc' }, 'danh mục'],
  ])('rejects %s', (_, change, message) => {
    const result = productCreateInput.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(message);
  });

  it('lets a draft have no variants yet', () => {
    expect(productCreateInput.safeParse({ ...valid, status: 'draft', variants: [] }).success).toBe(true);
  });
});

describe('productUpdateInput', () => {
  it('does not accept or require a code and treats missing variants as "unchanged"', () => {
    const { code: _code, variants: _variants, ...rest } = valid;
    expect(productUpdateInput.parse(rest).variants).toBeUndefined();
  });
});

describe('categoryInput', () => {
  it('trims, validates the slug and coerces the order', () => {
    expect(categoryInput.parse({ name: '  Áo polo ', sortOrder: '3', slug: 'ao-polo' })).toMatchObject({ name: 'Áo polo', sortOrder: 3, isActive: true });
    expect(categoryInput.safeParse({ name: 'x', slug: 'Bad Slug' }).success).toBe(false);
    expect(categoryInput.safeParse({ name: '  ' }).success).toBe(false);
  });
});

describe('list query and image order', () => {
  it('has sane pagination defaults and caps', () => {
    expect(productListQuery.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(productListQuery.safeParse({ pageSize: 500 }).success).toBe(false);
  });
  it('needs at least one image id', () => {
    expect(imageOrderInput.safeParse({ order: [] }).success).toBe(false);
    expect(imageOrderInput.safeParse({ order: [categoryId] }).success).toBe(true);
  });
});

describe('detectImage', () => {
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(16)]);
  const jpg = Buffer.from('ffd8ffe000104a46494600', 'hex');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

  it('trusts the file signature only', () => {
    expect(detectImage(png).ext).toBe('.png');
    expect(detectImage(jpg).ext).toBe('.jpg');
    expect(detectImage(webp).ext).toBe('.webp');
    expect(() => detectImage(Buffer.from('<svg onload=alert(1)>'))).toThrow('JPG, PNG');
    expect(() => detectImage(Buffer.from('GIF89a'))).toThrow();
  });

  it('rejects oversize files', () => {
    expect(() => detectImage(Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]))).toThrow('vượt quá');
  });
});

describe('apiError', () => {
  it('maps validation, our own errors and Postgres violations to HTTP statuses', async () => {
    const zod = productCreateInput.safeParse({ ...valid, priceVnd: -1 }).error as ZodError;
    expect((await apiError(zod).json()).error).toContain('priceVnd');
    expect(apiError(zod).status).toBe(400);
    expect(apiError(new HttpError('x', 404)).status).toBe(404);
    expect(apiError(Object.assign(new Error('dup'), { code: '23505' })).status).toBe(409);
    expect(apiError(Object.assign(new Error('fk'), { code: '23503' })).status).toBe(409);
    expect(apiError(new SyntaxError('bad json')).status).toBe(400);
  });
});

describe('storeListQuery', () => {
  it('applies defaults, normalises the slug and parses checkbox values', async () => {
    const { storeListQuery } = await import('@/features/catalog/schemas');
    expect(storeListQuery.parse({})).toMatchObject({ sort: 'newest', page: 1, pageSize: 12, inStock: false, onSale: false });
    expect(storeListQuery.parse({ category: ' Ao-Polo ', inStock: 'on', onSale: 'true', minPrice: '100000' })).toMatchObject({ category: 'ao-polo', inStock: true, onSale: true, minPrice: 100000 });
    expect(storeListQuery.safeParse({ sort: 'popular' }).success).toBe(false);
    expect(storeListQuery.safeParse({ pageSize: 500 }).success).toBe(false);
    expect(storeListQuery.safeParse({ minPrice: -5 }).success).toBe(false);
  });
});
