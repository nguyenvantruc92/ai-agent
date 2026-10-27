import { streamText, type ModelMessage } from 'ai';
import { generationSettings } from '@/features/chat/generation';
import { enforceGroundedNumbers } from '@/features/chat/grounding';
import { buildSystemPrompt } from '@/features/chat/prompt';
import { chatAnswerSchema, insufficientAnswer, type ChatAnswer } from '@/features/chat/schema';
import { smallTalkAnswer } from '@/features/chat/small-talk';
import { validateAnswer } from '@/features/chat/validation';
import { buildRetrievalQuery, type PreviousSource } from '@/features/rag/query';
import { retrieve } from '@/features/rag/retrieval';
import { env } from '@/lib/env';

export type SourceRef = { id: string; title: string; type: string };

export type FinalAnswer = ChatAnswer & {
  sources: SourceRef[];
  diagnostics: {
    route: 'small_talk' | 'rag' | 'agent' | 'limit' | 'guard';
    validation: string;
    unsupportedNumbers?: number[];
    promptSourceIds: string[];
    modelCitations: string[] | null;
    inputTokens: number;
    outputTokens: number;
  };
};

const emptyDiagnostics = { promptSourceIds: [], modelCitations: null, inputTokens: 0, outputTokens: 0 };

/**
 * The Week 6 RAG pipeline: retrieval (with follow-up expansion), streamed
 * structured generation and server-side citation validation.
 */
export async function answerWithRag(input: {
  message: string;
  history: ModelMessage[];
  previousSources: PreviousSource[];
  visitorHash: string;
  traceId: string;
  signal?: AbortSignal;
  onPartial?: (answer: string) => void;
}): Promise<FinalAnswer> {
  const smallTalk = smallTalkAnswer(input.message);
  if (smallTalk) return { ...smallTalk, sources: [], diagnostics: { route: 'small_talk', validation: 'small_talk', ...emptyDiagnostics } };

  const query = buildRetrievalQuery(input.message, input.previousSources);
  const retrieval = await retrieve({ query, message: input.message, traceId: input.traceId });
  if (!retrieval.chunks.length) return { ...insufficientAnswer, sources: [], diagnostics: { route: 'rag', validation: 'no_sources', ...emptyDiagnostics } };
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY chưa được cấu hình.');

  const { system, context, sourceIds } = await buildSystemPrompt(retrieval.chunks);
  let streamError: unknown;
  const result = streamText({
    ...generationSettings(input.visitorHash),
    system,
    messages: input.history,
    abortSignal: AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(env.OPENAI_TIMEOUT_MS)]),
    onError: ({ error }) => { streamError = error; },
  });
  let finalPartial: unknown;
  for await (const partial of result.experimental_partialOutputStream) {
    finalPartial = partial;
    if (partial.answer) input.onPartial?.(partial.answer);
  }
  if (streamError) throw streamError;

  const usage = await result.usage;
  const parsed = chatAnswerSchema.safeParse(finalPartial);
  const cited = parsed.success ? validateAnswer(parsed.data, sourceIds) : { answer: insufficientAnswer, outcome: 'schema_invalid' };
  // Numbers must come from the cited sources (or, for refusals, any source in the prompt) or the user's own words.
  const evidenceChunks = cited.answer.insufficientInformation ? context : context.filter((chunk) => cited.answer.citedSourceIds.includes(chunk.source_id));
  const userText = input.history.filter((message) => message.role === 'user').map((message) => String(message.content));
  const grounded = enforceGroundedNumbers(cited.answer, [...evidenceChunks.map((chunk) => chunk.content), input.message, ...userText]);
  const validation = grounded.unsupported.length ? { answer: grounded.answer, outcome: 'unsupported_number' } : cited;
  return {
    ...validation.answer,
    sources: context
      .filter((chunk) => validation.answer.citedSourceIds.includes(chunk.source_id))
      .map((chunk) => ({ id: chunk.source_id, title: chunk.title, type: chunk.source_type })),
    diagnostics: {
      route: 'rag',
      validation: validation.outcome,
      promptSourceIds: [...sourceIds],
      modelCitations: parsed.success ? parsed.data.citedSourceIds : null,
      unsupportedNumbers: grounded.unsupported,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  };
}
