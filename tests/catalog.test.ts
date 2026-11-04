import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildProductChunk } from '@/features/catalog/chunks';
import { stockStatus } from '@/features/catalog/stock';
import { toCatalogProduct } from '@/features/catalog/summary';
import { importStock, parseCatalogWorkbook } from '@/features/catalog/xlsx';
import { slugify } from '@/lib/slug';

function workbook(rows: Record<string, unknown>[], sheet = 'Catalog sản phẩm') {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheet);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const row = { product_id: 'pl-002', product_name: 'Áo polo pique trắng', category: 'Áo polo', price_vnd: 389000, description: 'Áo polo trắng cơ bản', sizes: 'S, M, L', colors: 'Trắng', material: '100% cotton pique', stock_status: 'Còn hàng', updated_at: '2026-10-27' };

describe('parseCatalogWorkbook', () => {
  it('normalises a row: upper-case code, size and colour lists', () => {
    const [product, ...rest] = parseCatalogWorkbook(workbook([row]));
    expect(rest).toHaveLength(0);
    expect(product).toMatchObject({ code: 'PL-002', category: 'Áo polo', priceVnd: 389000, sizes: ['S', 'M', 'L'], colors: ['Trắng'], updatedAt: '2026-10-27' });
  });

  it('falls back to Freesize and a default colour', () => {
    const [product] = parseCatalogWorkbook(workbook([{ ...row, sizes: '', colors: '' }]));
    expect(product.sizes).toEqual(['Freesize']);
    expect(product.colors).toEqual(['Mặc định']);
  });

  it('rejects missing values, bad prices, duplicate codes and the wrong sheet', () => {
    expect(() => parseCatalogWorkbook(workbook([{ ...row, price_vnd: '' }]))).toThrow('price_vnd');
    expect(() => parseCatalogWorkbook(workbook([{ ...row, price_vnd: 12.5 }]))).toThrow('Giá không hợp lệ');
    expect(() => parseCatalogWorkbook(workbook([row, { ...row, product_id: 'PL-002' }]))).toThrow('trùng');
    expect(() => parseCatalogWorkbook(workbook([row], 'Sheet1'))).toThrow('Catalog sản phẩm');
  });

  it('maps the sheet stock label to an initial quantity', () => {
    expect([importStock('Còn hàng'), importStock('Sắp hết hàng'), importStock('Hết hàng')]).toEqual([20, 2, 0]);
  });
});

describe('stockStatus', () => {
  it('uses the exact labels retrieval and the exchange policy match on', () => {
    expect(stockStatus([{ stock: 0 }, { stock: 0 }])).toBe('Hết hàng');
    expect(stockStatus([{ stock: 2 }, { stock: 3 }])).toBe('Sắp hết hàng');
    expect(stockStatus([{ stock: 20 }, { stock: 0 }])).toBe('Còn hàng');
    expect(stockStatus([])).toBe('Hết hàng');
  });
});

describe('toCatalogProduct', () => {
  const base = { code: 'SM-001', name: 'Áo sơ mi', category: 'Áo sơ mi', description: 'd', material: 'm', price_vnd: 499000, compare_at_price_vnd: null, updated_at: new Date('2026-10-27T00:00:00Z') };

  it('lists only sizes and colours that can still be bought', () => {
    const product = toCatalogProduct(base, [
      { size: 'S', color: 'Trắng', stock: 0 }, { size: 'M', color: 'Trắng', stock: 5 }, { size: 'M', color: 'Xanh', stock: 5 }, { size: 'L', color: 'Xanh', stock: 5 },
    ]);
    expect(product.sizes).toEqual(['M', 'L']);
    expect(product.colors).toEqual(['Trắng', 'Xanh']);
    expect(product.updatedAt).toBe('2026-10-27');
  });

  it('keeps every size visible when the product is sold out', () => {
    const product = toCatalogProduct(base, [{ size: 'S', color: 'Đen', stock: 0 }, { size: 'M', color: 'Đen', stock: 0 }]);
    expect(product.stockStatus).toBe('Hết hàng');
    expect(product.sizes).toEqual(['S', 'M']);
  });
});

describe('buildProductChunk', () => {
  const product = toCatalogProduct(
    { code: 'PL-002', name: 'Áo polo pique trắng', category: 'Áo polo', description: 'Áo polo trắng cơ bản', material: '100% cotton pique', price_vnd: 389000, compare_at_price_vnd: null, updated_at: '2026-10-27' },
    [{ size: 'S', color: 'Trắng', stock: 20 }, { size: 'M', color: 'Trắng', stock: 20 }],
  );

  it('keeps the labels and metadata keys that retrieval filters on', () => {
    const chunk = buildProductChunk(product);
    expect(chunk.sourceId).toBe('product:PL-002');
    expect(chunk.sourceType).toBe('product');
    expect(chunk.content).toContain('Giá: 389.000 VNĐ');
    expect(chunk.content).toContain('Size: S, M');
    expect(chunk.content).toContain('Tình trạng: Còn hàng');
    expect(chunk.metadata).toMatchObject({ product_id: 'PL-002', category: 'Áo polo', stock_status: 'Còn hàng', price_vnd: 389000, updated_at: '2026-10-27' });
  });

  it('is stable for unchanged products and changes when the price does', () => {
    expect(buildProductChunk(product).contentHash).toBe(buildProductChunk({ ...product }).contentHash);
    expect(buildProductChunk({ ...product, priceVnd: 349000, compareAtPriceVnd: 389000 }).contentHash).not.toBe(buildProductChunk(product).contentHash);
    expect(buildProductChunk({ ...product, priceVnd: 349000, compareAtPriceVnd: 389000 }).content).toContain('Giá gốc: 389.000 VNĐ');
  });
});

describe('slugify', () => {
  it('strips Vietnamese diacritics', () => {
    expect(slugify('Áo sơ mi Đẹp')).toBe('ao-so-mi-dep');
    expect(slugify('***')).toBe('khac');
  });
});

describe('friendlyError', () => {
  it('turns a missing OpenAI key into an actionable message and shortens long errors', async () => {
    const { friendlyError } = await import('@/lib/friendly-error');
    expect(friendlyError("You didn't provide an API key. You need to provide your API key in an Authorization header")).toContain('Admin → Cài đặt');
    expect(friendlyError('x'.repeat(500))).toHaveLength(201);
    expect(friendlyError('short')).toBe('short');
  });
});

describe('shipping and phone rules', () => {
  it('shipping is free from the threshold, charged below it, and zero for an empty basket', async () => {
    const { shippingFor } = await import('@/features/shop/settings');
    const rule = { shippingFeeVnd: 30000, freeShippingFromVnd: 799000 };
    expect([shippingFor(0, rule), shippingFor(798999, rule), shippingFor(799000, rule), shippingFor(2000000, rule)]).toEqual([0, 30000, 0, 0]);
  });

  it('normalises Vietnamese phone numbers and rejects the rest', async () => {
    const { normalizePhone, checkoutInput } = await import('@/features/orders/customer-schemas');
    expect(['0901 234 567', '+84 901.234.567', '84901234567', '(090) 123-4567'].map(normalizePhone)).toEqual(['0901234567', '0901234567', '0901234567', '0901234567']);
    expect(['12345', '09012345678', 'abc', '+1 555 123 4567'].map(normalizePhone)).toEqual([null, null, null, null]);
    const base = { name: 'An', phone: '0901234567', address: '12 Lê Lợi, Quận 1, TP.HCM', paymentMethod: 'COD', idempotencyKey: 'abcdefgh' };
    expect(checkoutInput.parse({ ...base, phone: '+84 901 234 567' }).phone).toBe('0901234567');
    expect(checkoutInput.safeParse({ ...base, phone: '123' }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...base, paymentMethod: 'bitcoin' }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...base, address: 'ngắn' }).success).toBe(false);
  });
});
