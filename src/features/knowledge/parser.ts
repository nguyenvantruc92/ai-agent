import { createHash } from 'node:crypto';
import type { ParsedChunk } from '@/features/knowledge/types';
import { slugify } from '@/lib/slug';
import { estimateTokens } from '@/lib/tokens';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const MAX_POLICY_CHUNK_TOKENS = 800;

/** Markdown/text fallback: keep heading context and split conservatively by paragraph. */
export function parseTextDocument(text: string, sourceType: 'policy' | 'product' = 'policy'): ParsedChunk[] {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) throw new Error('Tài liệu không có nội dung để index.');
  let heading = 'Tài liệu cửa hàng';
  let index = 0;
  const chunks: ParsedChunk[] = [];
  for (const section of normalized.split(/(?=^#{1,3}\s+.+$)/m)) {
    const lines = section.split('\n');
    const first = lines[0]?.match(/^#{1,3}\s+(.+)$/);
    if (first) heading = first[1].trim();
    const body = (first ? lines.slice(1) : lines).join('\n').trim();
    if (!body) continue;
    for (const part of splitByTokens(body, /\n\n+/, '\n\n')) {
      index += 1;
      const content = `[Nguồn: ${heading}]\n${part}`;
      chunks.push({ sourceId: `policy:${slugify(heading)}:${index}`, sourceType, title: heading, content, metadata: { section: slugify(heading), updated_at: null }, contentHash: hash(content) });
    }
  }
  return chunks;
}

/** Splits text on sentence boundaries so no piece exceeds MAX_POLICY_CHUNK_TOKENS. */
function splitByTokens(text: string, separator: RegExp, joiner: string) {
  const parts = text.split(separator).filter(Boolean);
  const groups: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = [current, part].filter(Boolean).join(joiner);
    if (current && estimateTokens(next) > MAX_POLICY_CHUNK_TOKENS) {
      groups.push(current);
      current = part;
    } else current = next;
  }
  if (current) groups.push(current);
  return groups;
}

const headingPattern = /^\d+\.\s+\S/;

/** Fallback for PDFs without the FAQ table layout: one chunk per numbered heading. */
export function parsePolicyText(text: string, updatedAt: string): ParsedChunk[] {
  const normalized = text.replace(/\r/g, '').replace(/\f/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sections = normalized.split(/(?=^\d+\.\s+[^\n]+$)/m).filter(Boolean);
  if (!sections.length) throw new Error('Không trích xuất được mục chính sách từ PDF.');

  return sections.flatMap((section) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const heading = lines.shift() ?? 'Chính sách cửa hàng';
    const title = heading.replace(/^\d+\.\s*/, '');
    // A very long section is cut only on paragraph boundaries to preserve FAQ pairs.
    return splitByTokens(lines.join('\n'), /\n\n+/, '\n\n').map((content, index) => {
      const complete = `[Nguồn: ${title}]\n${content}`;
      return {
        sourceId: `policy:${slugify(title)}:${index + 1}`,
        sourceType: 'policy' as const,
        title,
        content: complete,
        metadata: { section: slugify(title), updated_at: updatedAt, page: null },
        contentHash: hash(complete),
      };
    });
  });
}

export type PdfTextItem = { page: number; x: number; y: number; size: number; text: string };
type PdfLine = { page: number; y: number; size: number; cells: { x: number; text: string }[] };

/** Groups positioned text items into visual lines, top to bottom on each page. */
export function itemsToLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = items.filter((item) => item.text.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && line.page === item.page && Math.abs(line.y - item.y) < 2) {
      line.cells.push({ x: item.x, text: item.text });
      line.size = Math.max(line.size, item.size);
    } else lines.push({ page: item.page, y: item.y, size: item.size, cells: [{ x: item.x, text: item.text }] });
  }
  for (const line of lines) line.cells.sort((a, b) => a.x - b.x);
  return lines;
}

export const lineText = (line: PdfLine) => line.cells.map((cell) => cell.text.trim()).join(' ').trim();

/**
 * Parses the FAQ layout: numbered section headings, each followed by a
 * two-column "Câu hỏi | Thông tin" table. Every question–answer row becomes one
 * chunk. Rows are separated by a larger vertical gap than wrapped lines inside a
 * cell. Returns [] when no table header is found so callers can fall back.
 */
export function parsePolicyTable(items: PdfTextItem[], updatedAt: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  let section: { title: string; slug: string; index: number } | undefined;
  let answerX: number | undefined;
  let pair: { question: string[]; answer: string[]; page: number } | undefined;
  let previous: PdfLine | undefined;
  let rowStart = false;

  const flush = () => {
    if (!pair || !section) return;
    const question = pair.question.join(' ').replace(/\s+/g, ' ').trim();
    const answer = pair.answer.join(' ').replace(/\s+/g, ' ').trim();
    const page = pair.page;
    pair = undefined;
    if (!question || !answer) return;
    for (const part of splitByTokens(answer, /(?<=[.!?])\s+/, ' ')) {
      section.index += 1;
      const content = `[Nguồn: ${section.title}]\nCâu hỏi: ${question}\nThông tin: ${part}`;
      chunks.push({
        sourceId: `policy:${section.slug}:${section.index}`,
        sourceType: 'policy',
        title: `${section.title} — ${question}`,
        content,
        metadata: { section: section.slug, question, page, updated_at: updatedAt },
        contentHash: hash(content),
      });
    }
  };

  for (const line of itemsToLines(items)) {
    const text = lineText(line);
    const gap = previous && previous.page === line.page ? previous.y - line.y : Number.POSITIVE_INFINITY;
    if (headingPattern.test(text) && line.size >= 11) {
      flush();
      const title = text.replace(/^\d+\.\s*/, '');
      section = { title, slug: slugify(title), index: 0 };
      rowStart = true;
    } else if (section && line.cells.length >= 2 && line.cells[0].text.trim() === 'Câu hỏi' && line.cells.at(-1)?.text.trim() === 'Thông tin') {
      flush();
      answerX = line.cells.at(-1)!.x - 1;
      rowStart = true;
    } else if (section && answerX !== undefined) {
      const question = line.cells.filter((cell) => cell.x < answerX!).map((cell) => cell.text.trim()).join(' ');
      const answer = line.cells.filter((cell) => cell.x >= answerX!).map((cell) => cell.text.trim()).join(' ');
      if (question && (rowStart || gap > line.size * 1.8)) {
        flush();
        pair = { question: [question], answer: answer ? [answer] : [], page: line.page };
      } else if (pair) {
        if (question) pair.question.push(question);
        if (answer) pair.answer.push(answer);
      }
      rowStart = false;
    }
    previous = line;
  }
  flush();
  return answerX === undefined ? [] : chunks;
}
