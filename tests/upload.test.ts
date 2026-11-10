import { describe, expect, it } from 'vitest';
import { validateUpload } from '@/features/knowledge/files';
import { createMemoryRateLimitStore } from '@/lib/rate-limit';

const file = (name: string, type: string) => new File([], name, { type });

describe('validateUpload', () => {
  it('accepts PDF, Markdown/TXT and XLSX with matching extension, MIME and signature', () => {
    expect(validateUpload(file('faq.pdf', 'application/pdf'), Buffer.from('%PDF-1.7')).extension).toBe('.pdf');
    expect(validateUpload(file('catalog.xlsx', ''), Buffer.from('504b030414', 'hex')).extension).toBe('.xlsx');
    expect(validateUpload(file('notes.txt', 'text/plain'), Buffer.from('Nội dung chính sách')).extension).toBe('.txt');
    expect(validateUpload(file('notes.md', 'text/plain'), Buffer.from('# Chính sách')).extension).toBe('.md');
  });

  it('rejects mismatched signatures, extensions and MIME types', () => {
    expect(() => validateUpload(file('faq.pdf', 'application/pdf'), Buffer.from('PK\u0003\u0004'))).toThrow('Chữ ký');
    expect(() => validateUpload(file('notes.txt', 'text/plain'), Buffer.from('a\0b'))).toThrow('Chữ ký');
    expect(() => validateUpload(file('faq.pdf', 'text/html'), Buffer.from('%PDF-1.7'))).toThrow();
  });
});

describe('rate limit', () => {
  it('blocks after the limit and peeking does not consume', async () => {
    const key = `test:${Math.random()}`;
    const limiter = createMemoryRateLimitStore();
    for (let index = 0; index < 5; index += 1) expect((await limiter.take(key, 5, 60)).allowed).toBe(true);
    expect((await limiter.peek(key, 5)).allowed).toBe(false);
    expect((await limiter.take(key, 5, 60)).allowed).toBe(false);
  });
});
