/** Conservative estimate for Vietnamese text, which tokenizes denser than English. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}
