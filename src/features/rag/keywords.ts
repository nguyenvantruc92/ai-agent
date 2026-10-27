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

export const catalogCategories = ['Áo sơ mi', 'Áo polo', 'Áo thun', 'Áo khoác', 'Áo len', 'Quần chinos', 'Quần tây', 'Quần jeans', 'Quần jogger', 'Quần short', 'Phụ kiện'];

/** Category questions ("áo thun có không?") embed poorly, so they also get a category-filtered search. */
export function detectCategory(message: string) {
  const normalized = message.toLocaleLowerCase('vi-VN');
  return catalogCategories.find((category) => word([category.toLocaleLowerCase('vi-VN')]).test(normalized));
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
