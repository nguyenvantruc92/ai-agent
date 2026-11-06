import { describe, expect, it } from 'vitest';
import { prefixLines, wrapSelection } from '@/components/admin/prompt-editor';
import { defaultAgentInstructions } from '@/features/ai/prompt';
import { parseInline, parseMarkdown } from '@/lib/mini-markdown';

describe('mini markdown', () => {
  it('reads headings, paragraphs, bullets and numbered lists', () => {
    const blocks = parseMarkdown('## VAI TRÒ\nBạn là trợ lý.\nNói ngắn gọn.\n\n- một\n- hai\n\n1. bước 1\n2. bước 2');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'p', 'ul', 'ol']);
    expect(blocks[0]).toMatchObject({ level: 2, content: [{ kind: 'text', text: 'VAI TRÒ' }] });
    expect(blocks[1]).toMatchObject({ content: [{ kind: 'text', text: 'Bạn là trợ lý. Nói ngắn gọn.' }] });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('joins an indented continuation line to its bullet, as the default prompt wraps them', () => {
    const [list] = parseMarkdown('- Chỉ làm những việc\n  mà tool cho phép.\n- Việc khác');
    expect(list).toMatchObject({ type: 'ul', items: [[{ kind: 'text', text: 'Chỉ làm những việc mà tool cho phép.' }], [{ kind: 'text', text: 'Việc khác' }]] });
  });

  it('marks bold and code inline and leaves everything else as text (never HTML)', () => {
    expect(parseInline('KHÔNG **tự điền** `phone` <b>x</b>')).toEqual([
      { kind: 'text', text: 'KHÔNG ' }, { kind: 'bold', text: 'tự điền' }, { kind: 'text', text: ' ' }, { kind: 'code', text: 'phone' }, { kind: 'text', text: ' <b>x</b>' },
    ]);
  });

  it('turns the whole default prompt into headings and lists', () => {
    const blocks = parseMarkdown(defaultAgentInstructions);
    expect(blocks.filter((block) => block.type === 'heading').length).toBeGreaterThanOrEqual(8);
    expect(blocks.filter((block) => block.type === 'ul').length).toBeGreaterThanOrEqual(6);
  });
});

describe('prompt editor helpers', () => {
  it('wraps the selection in bold, or inserts a placeholder when nothing is selected', () => {
    expect(wrapSelection('Không tự điền', 6, 13, '**', 'in đậm')).toEqual({ value: 'Không **tự điền**', start: 8, end: 15 });
    expect(wrapSelection('', 0, 0, '**', 'in đậm')).toEqual({ value: '**in đậm**', start: 2, end: 8 });
  });

  it('prefixes every selected line and toggles the prefix off again', () => {
    const text = 'a\nb\nc';
    const on = prefixLines(text, 0, 3, () => '- ', /^\s*[-*•]\s+/);
    expect(on.value).toBe('- a\n- b\nc');
    expect(prefixLines(on.value, on.start, on.end, () => '- ', /^\s*[-*•]\s+/).value).toBe(text);
    expect(prefixLines('x\ny', 0, 3, (index) => `${index + 1}. `, /^\s*\d+[.)]\s+/).value).toBe('1. x\n2. y');
    expect(prefixLines('Tiêu đề', 2, 2, () => '## ', /^#{1,3}\s+/).value).toBe('## Tiêu đề');
  });
});
