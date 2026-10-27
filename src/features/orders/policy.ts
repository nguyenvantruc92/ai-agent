import { returnReasons, type Order, type Product, type RequestProposal, type ReturnReason } from '@/features/orders/types';

export const REQUEST_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type PolicyCheck =
  | { ok: true; idempotencyKey: string; summary: string; existingRequestId?: string }
  | { ok: false; code: string; message: string };

const normalizeSize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');

export function idempotencyKey(proposal: RequestProposal) {
  const base = `${proposal.orderId.toUpperCase()}:${proposal.productId.toUpperCase()}:${proposal.action}`;
  return proposal.action === 'exchange_size' ? `${base}:${normalizeSize(proposal.requestedSize)}` : base;
}

const reasonLabels: Record<string, string> = {
  wrong_item: 'nhận sai sản phẩm',
  wrong_size_or_color: 'sai size/màu so với đơn',
  manufacturing_defect: 'lỗi sản xuất',
};

/**
 * Server-side rules from the store policy (PDF sections 4–5) plus the
 * exercise scope: size exchange or return only, within 7 days of delivery.
 */
export function checkRequest(proposal: RequestProposal, order: Order | null, product: Product | null, now: Date): PolicyCheck {
  if (!order) return { ok: false, code: 'order_not_found', message: `Không tìm thấy đơn ${proposal.orderId}.` };
  const item = order.items.find((candidate) => candidate.productId.toUpperCase() === proposal.productId.toUpperCase());
  if (!item) return { ok: false, code: 'item_not_in_order', message: `Sản phẩm ${proposal.productId} không có trong đơn ${order.id}.` };
  if (order.status !== 'delivered' || !order.deliveredAt) return { ok: false, code: 'order_not_delivered', message: `Đơn ${order.id} chưa được giao (trạng thái: ${order.status}); chỉ xử lý đổi/trả sau khi nhận hàng.` };

  const days = (now.getTime() - new Date(order.deliveredAt).getTime()) / DAY_MS;
  if (days > REQUEST_WINDOW_DAYS) return { ok: false, code: 'window_expired', message: `Đơn ${order.id} đã nhận ${Math.floor(days)} ngày, quá thời hạn ${REQUEST_WINDOW_DAYS} ngày.` };
  if (/^tất\b/i.test(item.productName)) return { ok: false, code: 'excluded_item', message: 'Tất không áp dụng đổi trả.' };
  if (product?.category === 'Phụ kiện' && item.isOpened) return { ok: false, code: 'excluded_item', message: 'Phụ kiện đã mở bao bì không áp dụng đổi trả.' };
  if (item.discountPercent >= 40) return { ok: false, code: 'excluded_item', message: `Sản phẩm giảm giá ${item.discountPercent}% (từ 40% trở lên) không áp dụng đổi trả.` };

  const key = idempotencyKey(proposal);
  const same = order.requests.find((request) => request.idempotencyKey === key);
  if (same) return { ok: true, idempotencyKey: key, summary: describe(proposal, item.size), existingRequestId: same.id };
  const other = order.requests.find((request) => request.productId.toUpperCase() === proposal.productId.toUpperCase());
  if (other) return { ok: false, code: 'already_requested', message: `Sản phẩm này đã có yêu cầu ${other.type === 'return' ? 'trả hàng' : `đổi sang size ${other.requestedSize}`} (mã ${other.id.slice(0, 8)}).` };

  if (proposal.action === 'exchange_size') {
    if (!product) return { ok: false, code: 'product_not_found', message: `Không tìm thấy sản phẩm ${proposal.productId} trong catalog.` };
    const requested = normalizeSize(proposal.requestedSize);
    if (requested === normalizeSize(item.size)) return { ok: false, code: 'same_size', message: `Khách đang có size ${item.size}, trùng với size yêu cầu.` };
    if (!product.sizes.some((size) => normalizeSize(size) === requested)) return { ok: false, code: 'size_not_available', message: `${product.name} chỉ có size ${product.sizes.join(', ')}.` };
    if (/hết hàng/i.test(product.stockStatus) && !/sắp hết/i.test(product.stockStatus)) return { ok: false, code: 'out_of_stock', message: `${product.name} hiện đã hết hàng.` };
  } else if (!(returnReasons as readonly string[]).includes(proposal.reason)) {
    return { ok: false, code: 'invalid_reason', message: 'Chỉ nhận trả hàng khi nhận sai sản phẩm, sai size/màu so với đơn hoặc sản phẩm lỗi sản xuất; không hoàn tiền vì không thích sản phẩm.' };
  }
  return { ok: true, idempotencyKey: key, summary: describe(proposal, item.size) };
}

function describe(proposal: RequestProposal, currentSize: string) {
  return proposal.action === 'exchange_size'
    ? `Đổi ${proposal.productId} trong đơn ${proposal.orderId} từ size ${currentSize} sang size ${proposal.requestedSize}`
    : `Trả ${proposal.productId} trong đơn ${proposal.orderId} (lý do: ${reasonLabels[proposal.reason] ?? proposal.reason})`;
}

// What the customer must have said for each return reason; the model may not pick a reason on its own.
const reasonEvidence: Record<ReturnReason, RegExp> = {
  wrong_item: /(?:sai|nhầm|khác)\s*(?:sản phẩm|mẫu|hàng|món|mã)|giao\s*(?:sai|nhầm)|không phải (?:sản phẩm|mẫu|món)/iu,
  wrong_size_or_color: /(?:sai|nhầm|khác)\s*(?:size|cỡ|màu)|(?:size|cỡ|màu)\s*(?:bị\s*)?(?:sai|nhầm|không đúng|khác)/iu,
  manufacturing_defect: /lỗi|hỏng|rách|bung|tuột chỉ|thủng|phai màu|bạc màu|ố vàng|đứt/iu,
};

/** True when the customer's own words support the return reason the model proposed. */
export function returnReasonStated(reason: string, customerText: string) {
  const pattern = reasonEvidence[reason as ReturnReason];
  return Boolean(pattern?.test(customerText));
}
