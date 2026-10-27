import pdf from 'pdf-parse';
import { itemsToLines, lineText, type PdfTextItem } from '@/features/knowledge/parser';

type TextContent = { items: { str: string; height: number; transform: number[] }[] };

/** Extracts positioned text items (for table-aware parsing) and plain line text (for fallback). */
export async function extractPdf(buffer: Buffer) {
  const items: PdfTextItem[] = [];
  let page = 0;
  const result = await pdf(buffer, {
    // pdf-parse renders pages sequentially, so a counter gives the page number.
    pagerender: async (pageData: { getTextContent: () => Promise<TextContent> }) => {
      page += 1;
      const content = await pageData.getTextContent();
      const pageItems = content.items.map((item) => ({ page, x: item.transform[4], y: item.transform[5], size: item.height, text: item.str }));
      items.push(...pageItems);
      return itemsToLines(pageItems).map(lineText).join('\n');
    },
  });
  return { text: result.text, items, pages: result.numpages };
}
