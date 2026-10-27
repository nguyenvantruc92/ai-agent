import { insufficientAnswer, type ChatAnswer } from '@/features/chat/schema';

export type ValidationResult = { answer: ChatAnswer; outcome: 'valid' | 'insufficient' | 'invalid_citation' | 'missing_citation' };

/**
 * Any citation outside the sources placed in the prompt, or a factual answer
 * without citations, replaces the whole answer with the safe fallback.
 */
export function validateAnswer(answer: ChatAnswer, promptSourceIds: Set<string>): ValidationResult {
  if (answer.insufficientInformation) return { answer: { ...answer, citedSourceIds: [] }, outcome: 'insufficient' };
  const cited = [...new Set(answer.citedSourceIds)];
  if (!cited.length) return { answer: insufficientAnswer, outcome: 'missing_citation' };
  if (cited.some((id) => !promptSourceIds.has(id))) return { answer: insufficientAnswer, outcome: 'invalid_citation' };
  return { answer: { ...answer, citedSourceIds: cited }, outcome: 'valid' };
}
