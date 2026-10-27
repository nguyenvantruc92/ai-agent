import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseCatalog, parsePolicyTable, parsePolicyText, type PdfTextItem } from '@/features/knowledge/parser';

function workbook(rows: Record<string, unknown>[], sheet = 'Catalog sản phẩm') {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheet);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const product = { product_id: 'PL-002', product_name: 'Áo polo pique trắng', category: 'Áo polo', price_vnd: 389000, description: 'Áo polo trắng cơ bản', sizes: 'S, M, L', colors: 'Trắng', material: '100% cotton pique', stock_status: 'Còn hàng', updated_at: '2026-10-27' };

describe('parseCatalog', () => {
  it('creates one labelled chunk per product row', () => {
    const [chunk, ...rest] = parseCatalog(workbook([product]));
    expect(rest).toHaveLength(0);
    expect(chunk.sourceId).toBe('product:PL-002');
    expect(chunk.content).toContain('Giá: 389.000 VNĐ');
    expect(chunk.content).toContain('Size: S, M, L');
    expect(chunk.metadata).toMatchObject({ category: 'Áo polo', updated_at: '2026-10-27' });
  });

  it('rejects rows missing a required column', () => {
    expect(() => parseCatalog(workbook([{ ...product, price_vnd: '' }]))).toThrow('price_vnd');
  });

  it('only reads the catalog sheet', () => {
    expect(() => parseCatalog(workbook([product], 'Sheet1'))).toThrow('Catalog sản phẩm');
  });

  it('gives identical content the same hash', () => {
    expect(parseCatalog(workbook([product]))[0].contentHash).toBe(parseCatalog(workbook([product]))[0].contentHash);
  });
});

describe('parsePolicyText', () => {
  it('creates stable source ids by heading', () => {
    const chunks = parsePolicyText('1. Giao hàng\n\nPhí giao hàng là 30.000 VNĐ.', '2026-10-27');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sourceId).toBe('policy:giao-hang:1');
    expect(chunks[0].metadata.updated_at).toBe('2026-10-27');
  });

  it('keeps the uppercase Đ in slugs', () => {
    expect(parsePolicyText('2. Đặt hàng và thanh toán\n\nCó COD.', '2026-10-27')[0].sourceId).toBe('policy:dat-hang-va-thanh-toan:1');
  });
});

describe('parsePolicyTable', () => {
  const line = (page: number, y: number, x: number, text: string, size = 9.3): PdfTextItem => ({ page, x, y, size, text });
  const items = [
    line(1, 771, 127, 'FAQ VÀ CHÍNH SÁCH CỬA HÀNG', 19),
    line(1, 714, 54, '3. Giao hàng', 13),
    line(1, 689, 60, 'Câu hỏi'), line(1, 689, 202, 'Thông tin'),
    line(1, 666, 60, 'Phí giao hàng là bao'), line(1, 666, 202, 'Đơn hàng từ 799.000 VNĐ được miễn phí giao hàng.'),
    line(1, 653, 60, 'nhiêu?'), line(1, 653, 202, 'Đơn dưới 799.000 VNĐ phí 30.000 VNĐ.'),
    line(1, 630, 60, 'Thời gian giao hàng'), line(1, 630, 202, 'Nội thành 1–2 ngày làm việc.'),
    line(2, 760, 60, 'Câu hỏi'), line(2, 760, 202, 'Thông tin'),
    line(2, 737, 60, 'Giao quốc tế?'), line(2, 737, 202, 'Chỉ giao trong Việt Nam.'),
  ];

  it('creates one chunk per question–answer row, joining wrapped lines', () => {
    const chunks = parsePolicyTable(items, '2026-10-27');
    expect(chunks.map((chunk) => chunk.sourceId)).toEqual(['policy:giao-hang:1', 'policy:giao-hang:2', 'policy:giao-hang:3']);
    expect(chunks[0].metadata.question).toBe('Phí giao hàng là bao nhiêu?');
    expect(chunks[0].content).toContain('Đơn dưới 799.000 VNĐ phí 30.000 VNĐ.');
    expect(chunks[2].metadata.page).toBe(2);
  });

  it('returns no chunks for PDFs without the FAQ table', () => {
    expect(parsePolicyTable([line(1, 700, 54, '1. Giao hàng', 13), line(1, 680, 54, 'Phí 30.000 VNĐ.')], '2026-10-27')).toEqual([]);
  });

  it('splits answers longer than 800 tokens into separate chunks', () => {
    const sentence = 'Khách cần giữ nguyên tem mác và hóa đơn khi gửi trả sản phẩm cho cửa hàng. ';
    const long = [line(1, 714, 54, '1. Đổi trả', 13), line(1, 689, 60, 'Câu hỏi'), line(1, 689, 202, 'Thông tin'), line(1, 666, 60, 'Điều kiện?'), line(1, 666, 202, sentence.repeat(60))];
    const chunks = parsePolicyTable(long, '2026-10-27');
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((chunk) => chunk.sourceId)).size).toBe(chunks.length);
  });
});
