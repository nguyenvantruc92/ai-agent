import { describe, expect, it } from 'vitest';
import { detectCategory, detectPolicyTopics, foldVietnamese } from '@/features/rag/keywords';

describe('detectPolicyTopics', () => {
  it('matches Vietnamese keywords with diacritics', () => {
    expect(detectPolicyTopics('Tôi muốn đổi áo')).toEqual(['exchange_return']);
    expect(detectPolicyTopics('Chính sách trả hàng thế nào')).toEqual(['exchange_return']);
    expect(detectPolicyTopics('Hoàn tiền mất bao lâu?')).toEqual(['exchange_return']);
  });

  it('detects several topics in one question', () => {
    expect(detectPolicyTopics('Phí giao hàng và thanh toán COD?')).toEqual(['shipping', 'payment']);
  });

  it('does not match keywords inside other words', () => {
    expect(detectPolicyTopics('Áo sơ mi trắng')).toEqual([]);
    expect(detectPolicyTopics('Shipper giao chưa?')).toEqual([]);
  });
});

describe('detectCategory', () => {
  const categories = ['Áo sơ mi', 'Áo polo', 'Áo thun', 'Áo khoác', 'Quần jeans', 'Phụ kiện'];

  it('finds the catalog category named in the question', () => {
    expect(detectCategory('áo thun có không?', categories)).toBe('Áo thun');
    expect(detectCategory('Quần jeans nào màu xanh nhạt?', categories)).toBe('Quần jeans');
    expect(detectCategory('Phí giao hàng?', categories)).toBeUndefined();
  });

  it('uses whatever categories the shop has, not a fixed list', () => {
    expect(detectCategory('Có giày lười không?', [...categories, 'Giày lười'])).toBe('Giày lười');
    expect(detectCategory('Có giày lười không?', categories)).toBeUndefined();
    expect(detectCategory('áo thun có không?', [])).toBeUndefined();
  });

  it('matches questions typed without diacritics or with extra spaces', () => {
    expect(detectCategory('ao thun co khong', categories)).toBe('Áo thun');
    expect(detectCategory('phu kien nam', categories)).toBe('Phụ kiện');
    expect(detectCategory('Quần   jeans size 32', categories)).toBe('Quần jeans');
  });

  it('prefers the longer name and does not match inside other words', () => {
    expect(detectCategory('quần jeans slim có không', ['Quần jeans', 'Quần jeans slim'])).toBe('Quần jeans slim');
    expect(detectCategory('áo polos', categories)).toBeUndefined();
  });

  it('treats regex characters in a category name literally', () => {
    expect(detectCategory('có đồ (nam) không', ['Đồ (nam)'])).toBe('Đồ (nam)');
    expect(detectCategory('có đồ nam không', ['Đồ (nam)'])).toBeUndefined();
    expect(detectCategory('bất kỳ câu nào', ['.*'])).toBeUndefined();
  });
});

describe('foldVietnamese', () => {
  it('strips diacritics, đ and case', () => {
    expect(foldVietnamese('Đầm Dạ Hội')).toBe('dam da hoi');
    expect(foldVietnamese('Áo sơ mi')).toBe('ao so mi');
  });
});
