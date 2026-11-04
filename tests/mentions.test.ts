import { describe, expect, it } from 'vitest';
import { mentionedProductSources } from '@/features/agent/mentions';

const sources = [
  { id: 'product:SM-001', title: 'Áo sơ mi Oxford trắng dáng regular', type: 'product' },
  { id: 'product:SM-0012', title: 'Áo sơ mi linen', type: 'product' },
  { id: 'product:PL-002', title: 'Áo polo pique trắng', type: 'product' },
  { id: 'order:FT-2026-1001', title: 'Đơn hàng FT-2026-1001', type: 'order' },
];

describe('mentionedProductSources', () => {
  it('matches a product by its code, not by a longer code that starts with it', () => {
    expect(mentionedProductSources('Bạn xem Áo sơ mi Oxford (sm-001) nhé.', sources).map((s) => s.id)).toEqual(['product:SM-001']);
    expect(mentionedProductSources('Mẫu SM-0012 còn hàng.', sources).map((s) => s.id)).toEqual(['product:SM-0012']);
  });
  it('matches a product by its full name', () => {
    expect(mentionedProductSources('Mình gợi ý Áo polo pique trắng, giá 399.000đ.', sources).map((s) => s.id)).toEqual(['product:PL-002']);
  });
  it('ignores products the answer does not name and sources that are not products', () => {
    expect(mentionedProductSources('Đơn FT-2026-1001 đã giao.', sources)).toEqual([]);
    expect(mentionedProductSources('Bên mình có nhiều mẫu áo.', sources)).toEqual([]);
  });
});
