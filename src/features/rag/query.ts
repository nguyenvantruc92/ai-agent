export type PreviousSource = { id: string; title: string };

const referential = /(?<![\p{L}\p{N}])(?:nó|này|đó|ấy|kia|thì sao|thế còn|còn cái)(?![\p{L}\p{N}])/iu;

export function isFollowUp(message: string) {
  return message.trim().split(/\s+/).length <= 5 || referential.test(message);
}

/**
 * Follow-up questions borrow only validated source metadata from the previous
 * answer, never the model's previous text.
 */
export function buildRetrievalQuery(message: string, previousSources: PreviousSource[]) {
  if (!previousSources.length || !isFollowUp(message)) return message;
  return [message, ...previousSources.map((source) => `${source.title} (${source.id})`)].join('\n');
}
