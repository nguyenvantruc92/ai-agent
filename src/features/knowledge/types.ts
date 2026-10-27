export type ParsedChunk = {
  sourceId: string;
  sourceType: 'product' | 'policy';
  title: string;
  content: string;
  metadata: Record<string, string | number | string[] | null>;
  contentHash: string;
};
