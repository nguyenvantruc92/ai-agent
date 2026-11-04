import type { SourceRef } from '@/features/chat/rag-answer';

const norm = (value: string) => value.normalize('NFC').toLocaleLowerCase('vi-VN');

/**
 * Product sources of this turn that the answer talks about (by code such as "SM-001", or by full name). The model does not
 * always cite them, but the widget needs them to show the product boxes, so the answer text itself decides.
 */
export function mentionedProductSources(answer: string, turnSources: SourceRef[]): SourceRef[] {
  const text = norm(answer);
  return turnSources.filter((source) => {
    if (source.type !== 'product') return false;
    const code = norm(source.id.replace(/^product:/, ''));
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, 'u').test(text) || (source.title.length > 3 && text.includes(norm(source.title)));
  });
}
