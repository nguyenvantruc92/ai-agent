import type { ChatAnswer } from '@/features/chat/schema';

export type SourceRef = { id: string; title: string; type: string };
/** A source cited in the previous answer, kept in the thread state. */
export type PreviousSource = { id: string; title: string };

/** The answer a chat turn ends with: the model's structured answer plus validated sources and diagnostics. */
export type FinalAnswer = ChatAnswer & {
  sources: SourceRef[];
  diagnostics: {
    route: 'small_talk' | 'agent' | 'limit' | 'guard' | 'unavailable';
    validation: string;
    unsupportedNumbers?: number[];
    promptSourceIds: string[];
    modelCitations: string[] | null;
    inputTokens: number;
    outputTokens: number;
  };
};
