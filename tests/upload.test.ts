import { describe, expect, it } from 'vitest';
import { validateUpload } from '@/features/knowledge/files';
import { peekRateLimit, takeRateLimit } from '@/lib/rate-limit';

const file = (name: string, type: string) => new File([], name, { type });

describe('validateUpload', () => {
  it('accepts PDF and XLSX with matching extension, MIME and signature', () => {
    expect(validateUpload(file('faq.pdf', 'application/pdf'), Buffer.from('%PDF-1.7')).extension).toBe('.pdf');
    expect(validateUpload(file('catalog.xlsx', ''), Buffer.from('504b030414', 'hex')).extension).toBe('.xlsx');
  });

  it('rejects mismatched signatures, extensions and MIME types', () => {
    expect(() => validateUpload(file('faq.pdf', 'application/pdf'), Buffer.from('PK\u0003\u0004'))).toThrow('Chữ ký');
    expect(() => validateUpload(file('notes.txt', 'text/plain'), Buffer.from('hi'))).toThrow();
    expect(() => validateUpload(file('faq.pdf', 'text/html'), Buffer.from('%PDF-1.7'))).toThrow();
  });
});

describe('rate limit', () => {
  it('blocks after the limit and peeking does not consume', () => {
    const key = `test:${Math.random()}`;
    for (let index = 0; index < 5; index += 1) expect(takeRateLimit(key, 5, 60).allowed).toBe(true);
    expect(peekRateLimit(key, 5).allowed).toBe(false);
    expect(takeRateLimit(key, 5, 60).allowed).toBe(false);
  });
});
