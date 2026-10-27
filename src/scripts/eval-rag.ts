import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '@/db/client';
import { resetAgentRuntime } from '@/features/agent/runtime';
import { runChatTurn } from '@/features/agent/session';
import { env } from '@/lib/env';

type Case = { id: string; messages: string[]; expectedSourceIds: string[]; expectedKeywords: string[]; insufficientInformation: boolean };

const includesText = (haystack: string, needle: string) => haystack.toLocaleLowerCase('vi-VN').includes(needle.toLocaleLowerCase('vi-VN'));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value: number | null) => value === null ? null : Number(value.toFixed(4));

/** Runs every turn through the production LangGraph workflow (router → rag/agent), like /api/chat. */
async function runCase(test: Case) {
  const startedAt = Date.now();
  const threadId = randomUUID();
  await sql`INSERT INTO chat_threads (id, visitor_id) VALUES (${threadId}, ${`eval-rag:${test.id}`})`;
  let result: Awaited<ReturnType<typeof runChatTurn>> | undefined;
  let tokens = 0;
  for (const message of test.messages) {
    result = await runChatTurn({ threadId, visitorId: `eval-rag:${test.id}`, message, traceId: randomUUID() });
    if (result.kind === 'answer') tokens += result.answer.diagnostics.inputTokens + result.answer.diagnostics.outputTokens;
  }
  if (result?.kind !== 'answer') throw new Error(`Lượt cuối không trả lời (kind=${result?.kind}).`);
  const { answer } = result;
  const prompt = answer.diagnostics.promptSourceIds;
  const expected = test.expectedSourceIds;
  const recallAt5 = expected.length ? expected.filter((id) => prompt.includes(id)).length / expected.length : null;
  const citationCoverage = expected.length ? expected.filter((id) => answer.citedSourceIds.includes(id)).length / expected.length : null;
  const citationValid = answer.diagnostics.modelCitations === null ? null : answer.diagnostics.modelCitations.every((id) => prompt.includes(id));
  const missingKeywords = test.expectedKeywords.filter((keyword) => !includesText(answer.answer, keyword));
  const insufficientCorrect = answer.insufficientInformation === test.insufficientInformation;
  const passed = insufficientCorrect && missingKeywords.length === 0 && (recallAt5 ?? 1) === 1 && (citationCoverage ?? 1) === 1 && citationValid !== false;
  return {
    id: test.id,
    passed,
    traceId: result.traceId,
    route: answer.diagnostics.route as string,
    latencyMs: Date.now() - startedAt,
    tokens,
    promptSourceIds: prompt,
    citedSourceIds: answer.citedSourceIds,
    validation: answer.diagnostics.validation,
    recallAt5,
    citationValid,
    citationCoverage,
    insufficientCorrect,
    missingKeywords,
    answer: answer.answer,
    error: null as string | null,
  };
}

async function main() {
  const cases = JSON.parse(await readFile(join(process.cwd(), 'evals/golden-set.v1.json'), 'utf8')) as Case[];
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  for (const test of cases) {
    try {
      results.push(await runCase(test));
    } catch (error) {
      results.push({ id: test.id, passed: false, traceId: '', route: 'error', latencyMs: 0, tokens: 0, promptSourceIds: [], citedSourceIds: [], validation: 'error', recallAt5: null, citationValid: null, citationCoverage: null, insufficientCorrect: false, missingKeywords: [], answer: '', error: error instanceof Error ? error.message : String(error) });
    }
    const last = results.at(-1)!;
    console.log(`${last.passed ? 'PASS' : 'FAIL'} ${last.id}${last.error ? ` error=${last.error}` : ''}`);
  }

  const answered = results.filter((item) => !item.error);
  const latencies = answered.map((item) => item.latencyMs).sort((a, b) => a - b);
  const summary = {
    goldenSet: 'golden-set.v1',
    model: env.OPENAI_CHAT_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    retrieval: { topK: env.RETRIEVAL_TOP_K, minSimilarity: env.RETRIEVAL_MIN_SIMILARITY, maxContextChunks: env.MAX_CONTEXT_CHUNKS, maxContextTokens: env.MAX_CONTEXT_TOKENS },
    cases: results.length,
    passed: results.filter((item) => item.passed).length,
    errors: results.filter((item) => item.error).length,
    recallAt5: round(average(answered.flatMap((item) => item.recallAt5 ?? []))),
    citationValidity: round(average(answered.flatMap((item) => item.citationValid === null ? [] : [Number(item.citationValid)]))),
    citationCoverage: round(average(answered.flatMap((item) => item.citationCoverage ?? []))),
    insufficientAccuracy: round(average(answered.map((item) => Number(item.insufficientCorrect)))),
    keywordAccuracy: round(average(answered.map((item) => Number(item.missingKeywords.length === 0)))),
    latencyMs: { avg: Math.round(average(latencies) ?? 0), p95: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? 0 },
    totalTokens: answered.reduce((sum, item) => sum + item.tokens, 0),
  };
  const outputDir = join(process.cwd(), 'data', 'eval-results');
  await mkdir(outputDir, { recursive: true });
  const destination = join(outputDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(destination, JSON.stringify({ ...summary, results }, null, 2));
  console.log(JSON.stringify({ ...summary, destination }, null, 2));
  for (const item of results.filter((result) => !result.passed)) {
    console.log(`\n[${item.id}] route=${item.route} validation=${item.validation} recall=${item.recallAt5} coverage=${item.citationCoverage} insufficientOk=${item.insufficientCorrect} missing=${JSON.stringify(item.missingKeywords)}\n  prompt=${item.promptSourceIds.join(', ')}\n  cited=${item.citedSourceIds.join(', ')}\n  answer=${item.answer.slice(0, 200)}`);
  }
  await resetAgentRuntime();
  await sql.end();
}

void main();
