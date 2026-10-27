import { insufficientAnswer, type ChatAnswer } from '@/features/chat/schema';

// "389.000" / "1.199.000" are thousands groups; "3,5" or "0.55" are decimals.
const numberPattern = /\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+(?:[.,]\d{1,2})?(?!\d)/g;
const multipliers: [RegExp, number][] = [[/^\s?(?:k|nghìn|ngàn)(?![\p{L}])/iu, 1_000], [/^\s?triệu/iu, 1_000_000]];

/** Numbers as values, so "389.000 VNĐ", "389000" and "389k" compare equal. */
export function extractNumbers(text: string) {
  const values: number[] = [];
  for (const match of text.matchAll(numberPattern)) {
    const raw = match[0];
    let value = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw) ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'));
    const rest = text.slice(match.index! + raw.length);
    for (const [pattern, factor] of multipliers) if (pattern.test(rest)) value *= factor;
    values.push(Math.round(value * 100) / 100);
  }
  return values;
}

/**
 * Numbers in the answer that the evidence does not support. Small counts
 * (≤ 10), sums/differences of two evidence numbers and quantity × price are
 * accepted so simple arithmetic like "giá + phí ship" is not rejected.
 */
export function unsupportedNumbers(answer: string, evidence: string[]) {
  const known = [...new Set(evidence.flatMap(extractNumbers))];
  const allowed = new Set(known);
  const derived = (value: number) => known.some((a) => known.some((b) =>
    Math.abs(a + b - value) < 0.01 || Math.abs(Math.abs(a - b) - value) < 0.01 || (a <= 10 && Math.abs(a * b - value) < 0.01)));
  return [...new Set(extractNumbers(answer))].filter((value) => value > 10 && !allowed.has(value) && !derived(value));
}

/** Facts the system prompts state about the store itself; always valid evidence. */
export const STORE_FACTS = 'Fashion Tomodev, 72–74 Lê Đại Hành, TP. Đà Nẵng';

/** Replaces answers that state numbers (prices, sizes, days…) not present in their sources. */
export function enforceGroundedNumbers(answer: ChatAnswer, evidence: string[]) {
  const unsupported = unsupportedNumbers(answer.answer, [STORE_FACTS, ...evidence]);
  return unsupported.length ? { answer: insufficientAnswer, unsupported } : { answer, unsupported };
}
