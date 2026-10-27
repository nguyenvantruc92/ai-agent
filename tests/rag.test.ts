import { describe, expect, it } from 'vitest';
import { detectCategory, detectPolicyTopics } from '@/features/rag/keywords';
import { buildRetrievalQuery, isFollowUp } from '@/features/rag/query';

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
  it('finds the catalog category named in the question', () => {
    expect(detectCategory('áo thun có không?')).toBe('Áo thun');
    expect(detectCategory('Quần jeans nào màu xanh nhạt?')).toBe('Quần jeans');
    expect(detectCategory('Phí giao hàng?')).toBeUndefined();
  });
});

describe('buildRetrievalQuery', () => {
  const previous = [{ id: 'product:PL-002', title: 'Áo polo pique trắng' }];

  it('adds validated previous source metadata to short or referential questions', () => {
    expect(isFollowUp('Còn size L không?')).toBe(true);
    expect(isFollowUp('Giá của nó bao nhiêu vậy bạn ơi?')).toBe(true);
    expect(buildRetrievalQuery('Còn size L không?', previous)).toBe('Còn size L không?\nÁo polo pique trắng (product:PL-002)');
  });

  it('keeps standalone questions unchanged', () => {
    expect(buildRetrievalQuery('Shop có những phương thức thanh toán nào?', previous)).toBe('Shop có những phương thức thanh toán nào?');
    expect(buildRetrievalQuery('Còn size L không?', [])).toBe('Còn size L không?');
  });
});
