import { describe, expect, it } from 'vitest';
import type { DbChunk } from '@/db/client';
import { loadPromptTemplate, selectContext } from '@/features/chat/prompt';
import { chatRequestSchema, insufficientAnswer } from '@/features/chat/schema';
import { validateAnswer } from '@/features/chat/validation';

const allowed = new Set(['product:PL-002', 'policy:giao-hang:1']);

describe('validateAnswer', () => {
  it('keeps answers whose citations were all in the prompt', () => {
    const result = validateAnswer({ answer: 'Giá 389.000 VNĐ.', citedSourceIds: ['product:PL-002', 'product:PL-002'], insufficientInformation: false }, allowed);
    expect(result.outcome).toBe('valid');
    expect(result.answer.citedSourceIds).toEqual(['product:PL-002']);
  });

  it('replaces the whole answer when any citation is invalid', () => {
    const result = validateAnswer({ answer: 'Giá 389.000 VNĐ.', citedSourceIds: ['product:PL-002', 'product:XX-999'], insufficientInformation: false }, allowed);
    expect(result).toEqual({ answer: insufficientAnswer, outcome: 'invalid_citation' });
  });

  it('replaces factual answers without citations', () => {
    expect(validateAnswer({ answer: 'Giá 389.000 VNĐ.', citedSourceIds: [], insufficientInformation: false }, allowed).outcome).toBe('missing_citation');
  });

  it('drops citations from insufficient-information answers', () => {
    const result = validateAnswer({ answer: 'Shop chưa có thông tin.', citedSourceIds: ['product:PL-002'], insufficientInformation: true }, allowed);
    expect(result.answer.citedSourceIds).toEqual([]);
  });
});

describe('chatRequestSchema', () => {
  it('accepts only threadId and message', () => {
    expect(chatRequestSchema.safeParse({ message: 'Xin chào' }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ message: 'Hi', model: 'gpt-4o' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: 'Hi', sources: [] }).success).toBe(false);
  });

  it('rejects empty, oversized or non-uuid input and strips control characters', () => {
    expect(chatRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: 'Hi', threadId: 'abc' }).success).toBe(false);
    expect(chatRequestSchema.parse({ message: 'Phí\u0000 ship?' }).message).toBe('Phí ship?');
  });
});

describe('prompt', () => {
  it('sends only the versioned text block with the sources placeholder', async () => {
    const template = await loadPromptTemplate();
    expect(template).toContain('{{retrieved_sources}}');
    expect(template).not.toContain('Hợp đồng server-side');
  });

  it('limits context by chunk count and token budget', () => {
    const chunk = (id: string, length: number) => ({ id, source_id: id, source_type: 'policy', title: id, content: 'x'.repeat(length), metadata: {}, similarity: 0.9 }) as DbChunk;
    expect(selectContext([chunk('a', 300), chunk('b', 300), chunk('c', 300), chunk('d', 300), chunk('e', 300), chunk('f', 300)])).toHaveLength(5);
    expect(selectContext([chunk('a', 3000), chunk('b', 1000)]).map((item) => item.source_id)).toEqual(['a']);
  });
});
