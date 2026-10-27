import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import type { ParsedChunk } from '@/features/knowledge/types';
import { estimateTokens } from '@/lib/tokens';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const MAX_POLICY_CHUNK_TOKENS = 800;

const requiredProductColumns = ['product_id', 'product_name', 'price_vnd', 'updated_at'] as const;

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export function parseCatalog(buffer: Buffer): ParsedChunk[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const worksheet = workbook.Sheets['Catalog sản phẩm'];
  if (!worksheet) throw new Error('Không tìm thấy sheet Catalog sản phẩm.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (!rows.length) throw new Error('Catalog không có sản phẩm.');

  return rows.map((row) => {
    for (const column of requiredProductColumns) {
      if (!String(row[column] ?? '').trim()) throw new Error(`Thiếu cột hoặc giá trị ${column}.`);
    }
    const productId = String(row.product_id).trim();
    const sizes = String(row.sizes ?? row.size ?? '').trim();
    const colors = String(row.colors ?? row.color ?? '').trim();
    const metadata = {
      product_id: productId,
      category: String(row.category ?? '').trim(),
      updated_at: String(row.updated_at).trim(),
      price_vnd: Number(row.price_vnd),
      stock_status: String(row.stock_status ?? '').trim(),
      sizes: splitList(sizes),
      colors: splitList(colors),
    };
    const content = [
      `[Mã: ${productId}]`,
      `Tên sản phẩm: ${String(row.product_name).trim()}`,
      `Danh mục: ${metadata.category}`,
      `Giá: ${Number(row.price_vnd).toLocaleString('vi-VN')} VNĐ`,
      `Mô tả: ${String(row.description ?? '').trim()}`,
      `Size: ${sizes}`,
      `Màu: ${colors}`,
      `Chất liệu: ${String(row.material ?? '').trim()}`,
      `Tình trạng: ${metadata.stock_status}`,
      `Cập nhật: ${metadata.updated_at}`,
    ].join('\n');
    return {
      sourceId: `product:${productId}`,
      sourceType: 'product' as const,
      title: String(row.product_name).trim(),
      content,
      metadata,
      contentHash: hash(content),
    };
  });
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'khac';
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
