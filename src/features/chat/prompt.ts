import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbChunk } from '@/db/client';
import { env } from '@/lib/env';
import { estimateTokens } from '@/lib/tokens';

const promptPath = join(process.cwd(), 'prompts', 'fashion-tomodev-rag-system.md');
let template: Promise<string> | undefined;

/** The versioned prompt file documents the prompt; only its ```text block is sent to the model. */
export function loadPromptTemplate() {
  template ??= readFile(promptPath, 'utf8').then((markdown) => {
    const block = markdown.match(/```text\n([\s\S]*?)\n```/)?.[1];
    if (!block?.includes('{{retrieved_sources}}')) throw new Error('Prompt template thiếu block text hoặc {{retrieved_sources}}.');
    return block;
  });
  return template;
}

/** Keeps retrieval order and stops at the first chunk that would exceed MAX_CONTEXT_TOKENS. */
export function selectContext(chunks: DbChunk[]) {
  const selected: DbChunk[] = [];
  let budget = env.MAX_CONTEXT_TOKENS;
  for (const chunk of chunks.slice(0, env.MAX_CONTEXT_CHUNKS)) {
    budget -= estimateTokens(chunk.content);
    if (budget < 0) break;
    selected.push(chunk);
  }
  return selected;
}

export function renderSources(chunks: DbChunk[]) {
  return chunks
    .map((chunk) => `<source id="${chunk.source_id}" updated_at="${String(chunk.metadata.updated_at ?? '')}">\n${chunk.content}\n</source>`)
    .join('\n');
}

export async function buildSystemPrompt(chunks: DbChunk[]) {
  const context = selectContext(chunks);
  const system = (await loadPromptTemplate()).replace('{{retrieved_sources}}', renderSources(context));
  return { system, context, sourceIds: new Set(context.map((chunk) => chunk.source_id)) };
}
