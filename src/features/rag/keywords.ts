export type PolicyTopic = 'shipping' | 'exchange_return' | 'payment' | 'size_guide';

// `\b` treats Vietnamese letters with diacritics as non-word characters, so
// boundaries are spelled out with Unicode letter/number classes instead.
const word = (alternatives: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const policyTopics: [PolicyTopic, RegExp][] = [
  ['shipping', word(['ship', 'giao hàng', 'phí giao'])],
  ['exchange_return', word(['đổi', 'trả', 'hoàn tiền'])],
  ['payment', word(['cod', 'thanh toán', 'chuyển khoản'])],
  ['size_guide', word(['size', 'số đo'])],
];

export function detectPolicyTopics(message: string): PolicyTopic[] {
  return policyTopics.filter(([, pattern]) => pattern.test(message)).map(([topic]) => topic);
}

/** Lower case without diacritics, so "ao thun" (typed without accents) matches "Áo thun". */
export function foldVietnamese(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi-VN').replace(/đ/g, 'd');
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Category questions ("áo thun có không?") embed poorly, so they also get a category-filtered search.
 * `categories` are the shop's category names (from the database); the returned name is one of them, unchanged.
 * Longer names win, so "Quần jeans slim" is preferred over "Quần jeans" when both are in the question.
 */
export function detectCategory(message: string, categories: readonly string[]) {
  const folded = foldVietnamese(message);
  return [...categories]
    .sort((a, b) => b.length - a.length)
    .find((category) => {
      const name = foldVietnamese(category).trim();
      return name.length > 0 && word([escapeRegExp(name).replace(/\s+/g, '\\s+')]).test(folded);
    });
}

export function isBroadCatalogQuestion(message: string) {
  return /quần áo|có bán|sản phẩm.*không|shop.*có/iu.test(message);
}

/** "Sản phẩm nào sắp hết hàng?" needs a filter on stock_status, which embeddings cannot express. */
export function detectStockStatus(message: string) {
  if (word(['sắp hết', 'sắp hết hàng', 'gần hết hàng']).test(message)) return 'Sắp hết hàng';
  if (word(['đã hết hàng', 'hết hàng', 'hết sạch']).test(message)) return 'Hết hàng';
  return undefined;
}
