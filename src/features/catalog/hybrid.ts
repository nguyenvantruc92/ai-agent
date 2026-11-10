/**
 * Reciprocal rank fusion: merges several ranked lists of product codes into one. A code ranked high in any list, or present
 * in several, comes first. `k` damps the advantage of rank 1 over the rest (60 is the usual value).
 */
export function mergeRanked(lists: readonly (readonly string[])[], limit: number, k = 60) {
  const scores = new Map<string, number>();
  for (const list of lists) list.forEach((code, index) => scores.set(code, (scores.get(code) ?? 0) + 1 / (k + index + 1)));
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([code]) => code);
}
