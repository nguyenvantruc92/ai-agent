/**
 * A tiny Markdown reader for agent prompts: `## heading`, `- bullet`, `1. numbered`, blank-line separated paragraphs, and
 * `**bold**` / `` `code` `` inside text. It produces data, not HTML, so the preview can render it as React elements and
 * nothing a prompt contains can inject markup. The prompt itself stays plain text (models read Markdown fine).
 */
export type Inline = { kind: 'text' | 'bold' | 'code'; text: string };
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'p'; content: Inline[] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push(match[1] !== undefined ? { kind: 'bold', text: match[1] } : { kind: 'code', text: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

const bullet = /^\s*[-*•]\s+(.*)$/;
const numbered = /^\s*\d+[.)]\s+(.*)$/;
const heading = /^(#{1,3})\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: 'p', content: parseInline(paragraph.join(' ')) }); paragraph = []; };
  const flushList = () => { if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) }); list = null; };

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const head = heading.exec(line);
    const item = bullet.exec(line);
    const numberedItem = numbered.exec(line);
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (head) { flushParagraph(); flushList(); blocks.push({ type: 'heading', level: head[1].length as 1 | 2 | 3, content: parseInline(head[2]) }); continue; }
    if (item || numberedItem) {
      flushParagraph();
      const type = item ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push((item ?? numberedItem)![1]);
      continue;
    }
    // An indented line right after a list item continues that item (the default prompt wraps long bullets this way).
    if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList();
  return blocks;
}
