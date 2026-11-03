import * as XLSX from 'xlsx';
import type { ImportRow } from '@/features/catalog/types';

const requiredColumns = ['product_id', 'product_name', 'price_vnd', 'updated_at'] as const;
const splitList = (value: string) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

/** Reads the "Catalog sản phẩm" sheet into validated rows. Throws a Vietnamese message on the first problem. */
export function parseCatalogWorkbook(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const worksheet = workbook.Sheets['Catalog sản phẩm'];
  if (!worksheet) throw new Error('Không tìm thấy sheet Catalog sản phẩm.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (!rows.length) throw new Error('Catalog không có sản phẩm.');

  const seen = new Set<string>();
  return rows.map((row) => {
    for (const column of requiredColumns) {
      if (!String(row[column] ?? '').trim()) throw new Error(`Thiếu cột hoặc giá trị ${column}.`);
    }
    const code = String(row.product_id).trim().toUpperCase();
    if (seen.has(code)) throw new Error(`Mã sản phẩm bị trùng: ${code}.`);
    seen.add(code);
    const priceVnd = Number(row.price_vnd);
    if (!Number.isInteger(priceVnd) || priceVnd < 0) throw new Error(`Giá không hợp lệ ở ${code}.`);
    const updatedAt = String(row.updated_at).trim();
    if (Number.isNaN(Date.parse(updatedAt))) throw new Error(`Ngày cập nhật không hợp lệ ở ${code}.`);
    const sizes = splitList(String(row.sizes ?? row.size ?? ''));
    const colors = splitList(String(row.colors ?? row.color ?? ''));
    return {
      code,
      name: String(row.product_name).trim(),
      category: String(row.category ?? '').trim() || 'Khác',
      priceVnd,
      description: String(row.description ?? '').trim(),
      material: String(row.material ?? '').trim(),
      sizes: sizes.length ? sizes : ['Freesize'],
      colors: colors.length ? colors : ['Mặc định'],
      stockStatus: String(row.stock_status ?? '').trim(),
      updatedAt,
    };
  });
}

/** The spreadsheet only says "Còn hàng" / "Sắp hết hàng" / "Hết hàng", so imports start variants at these quantities. */
export const IMPORT_STOCK = { inStock: 20, low: 2, out: 0 } as const;

export function importStock(stockStatus: string) {
  if (/sắp hết/i.test(stockStatus)) return IMPORT_STOCK.low;
  if (/hết hàng/i.test(stockStatus)) return IMPORT_STOCK.out;
  return IMPORT_STOCK.inStock;
}
