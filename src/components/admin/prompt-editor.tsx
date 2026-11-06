'use client';

import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Textarea } from '@/components/admin-ui/textarea';
import { cn } from '@/lib/cn';
import { parseMarkdown, type Inline } from '@/lib/mini-markdown';

type Edit = { value: string; start: number; end: number };

/** Wraps the selection, or inserts `placeholder` wrapped when nothing is selected. */
export function wrapSelection(value: string, start: number, end: number, mark: string, placeholder: string): Edit {
  const selected = value.slice(start, end) || placeholder;
  const next = `${value.slice(0, start)}${mark}${selected}${mark}${value.slice(end)}`;
  return { value: next, start: start + mark.length, end: start + mark.length + selected.length };
}

/** Puts `prefix` on every line touched by the selection; lines that already have it lose it (toggle). */
export function prefixLines(value: string, start: number, end: number, prefix: (index: number) => string, has: RegExp): Edit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const found = value.indexOf('\n', end);
  const lineEnd = found === -1 ? value.length : found;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const allHave = lines.every((line) => has.test(line));
  const changed = lines.map((line, index) => allHave ? line.replace(has, '') : `${prefix(index)}${line.replace(has, '')}`).join('\n');
  return { value: `${value.slice(0, lineStart)}${changed}${value.slice(lineEnd)}`, start: lineStart, end: lineStart + changed.length };
}

const headingMark = /^#{1,3}\s+/;
const bulletMark = /^\s*[-*•]\s+/;
const numberMark = /^\s*\d+[.)]\s+/;

const inline = (parts: Inline[]): ReactNode => parts.map((part, index) => part.kind === 'bold'
  ? <strong key={index} className="font-semibold text-gray-900 dark:text-white">{part.text}</strong>
  : part.kind === 'code' ? <code key={index} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] dark:bg-white/10">{part.text}</code>
  : <Fragment key={index}>{part.text}</Fragment>);

/** The prompt as formatted text (read-only). */
export function PromptPreview({ value }: { value: string }) {
  const blocks = parseMarkdown(value);
  if (!blocks.length) return <p className="text-sm text-gray-400">Chưa có nội dung.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
      {blocks.map((block, index) => block.type === 'heading'
        ? <h4 key={index} className={cn('font-semibold text-gray-900 dark:text-white', block.level === 1 ? 'text-base' : 'pt-2 text-[13px] uppercase tracking-wide text-brand-600 dark:text-brand-400')}>{inline(block.content)}</h4>
        : block.type === 'p' ? <p key={index}>{inline(block.content)}</p>
        : block.type === 'ul' ? <ul key={index} className="list-disc space-y-1 ps-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>
        : <ol key={index} className="list-decimal space-y-1 ps-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>)}
    </div>
  );
}

const tool = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white';

/**
 * A plain text editor for agent prompts with a small Markdown toolbar (heading, bold, bullets, numbers) and a formatted preview.
 * The value stays plain text: the toolbar only inserts the characters you could type yourself.
 */
export function PromptEditor({ value, onChange, maxLength, required, rows = 20, placeholder }: { value: string; onChange: (value: string) => void; maxLength: number; required?: boolean; rows?: number; placeholder?: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  function apply(make: (value: string, start: number, end: number) => Edit) {
    const element = area.current;
    if (!element) return;
    const edit = make(element.value, element.selectionStart, element.selectionEnd);
    onChange(edit.value);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(edit.start, edit.end); });
  }

  const tab = (name: 'edit' | 'preview', label: string) => (
    <button type="button" onClick={() => setMode(name)} aria-pressed={mode === name}
      className={cn('rounded-md px-3 py-1 text-[13px] font-medium', mode === name ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white')}>{label}</button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-800 dark:bg-white/3">
        <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/5">{tab('edit', 'Soạn thảo')}{tab('preview', 'Xem trước')}</div>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
        <button type="button" className={tool} disabled={mode !== 'edit'} title="Tiêu đề mục (##)" onClick={() => apply((v, s, e) => prefixLines(v, s, e, () => '## ', headingMark))}>H</button>
        <button type="button" className={cn(tool, 'font-bold')} disabled={mode !== 'edit'} title="In đậm (**)" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**', 'in đậm'))}>B</button>
        <button type="button" className={tool} disabled={mode !== 'edit'} title="Gạch đầu dòng (-)" onClick={() => apply((v, s, e) => prefixLines(v, s, e, () => '- ', bulletMark))}>• Danh sách</button>
        <button type="button" className={tool} disabled={mode !== 'edit'} title="Danh sách đánh số (1.)" onClick={() => apply((v, s, e) => prefixLines(v, s, e, (i) => `${i + 1}. `, numberMark))}>1. Số</button>
      </div>
      {mode === 'edit'
        ? <Textarea ref={area} required={required} minLength={20} maxLength={maxLength} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
            className="rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus:ring-0 focus-visible:ring-0" />
        : <div className="max-h-[32rem] min-h-40 overflow-auto px-4 py-3"><PromptPreview value={value} /></div>}
    </div>
  );
}
