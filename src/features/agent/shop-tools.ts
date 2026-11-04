import { sql } from '@/db/client';
import { claimConfirmation, finishConfirmation, getConfirmation, type ConfirmationAction, type ConfirmationRow } from '@/features/agent/confirmations';
import { cartFingerprint, orderFingerprint, type AgentCart, type AgentProductHit, type CancelPayload, type CheckoutPayload } from '@/features/agent/shop-types';
import { storeListQuery } from '@/features/catalog/schemas';
import { mergeRanked } from '@/features/catalog/hybrid';
import { listStoreCardsByCodes, listStoreProducts, type StoreCard } from '@/features/catalog/queries';
import { embedQuery } from '@/features/rag/retrieval';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { checkout } from '@/features/orders/checkout';
import { cancelCustomerOrder, getCustomerOrder } from '@/features/orders/customer-orders';
import { normalizePhone } from '@/features/orders/customer-schemas';
import { findOrder } from '@/features/orders/repository';
import { addToCart, getCart, MAX_PER_LINE, removeLine, setLineQuantity } from '@/features/shop/cart';
import { HttpError } from '@/lib/http';
import { peekRateLimit, takeRateLimit } from '@/lib/rate-limit';

/**
 * Server side of the agent's shopping tools (called by the MCP server). Nothing here trusts the model for identity:
 * the visitor is looked up from the chat thread, and checkout/cancel run only what the customer confirmed.
 */

/** The browser identity that owns a chat thread. */
export async function visitorOfThread(threadId: string) {
  const [thread] = await sql<{ visitor_id: string }[]>`SELECT visitor_id FROM chat_threads WHERE id = ${threadId}`;
  if (!thread) throw new HttpError('Không tìm thấy cuộc trò chuyện.', 404);
  return thread.visitor_id;
}

// ───────────── Catalogue ─────────────

const toHit = (card: StoreCard): AgentProductHit => ({
  source_id: `product:${card.code}`, product_id: card.code, name: card.name, category: card.categoryName,
  price_vnd: card.priceVnd, compare_at_price_vnd: card.compareAtPriceVnd, colors: card.colors, sizes_in_stock: card.sizes, in_stock: !card.soldOut,
});
const HIT_LIMIT = 5;
const SEMANTIC_TIMEOUT_MS = 6_000;

/** Keyword search; trailing words are dropped until something matches ("áo polo trắng size M" still finds the polo). */
async function keywordProducts(query: string, maxPriceVnd: number | null): Promise<StoreCard[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (let count = words.length; count >= 1; count -= 1) {
    const result = await listStoreProducts(storeListQuery.parse({ q: words.slice(0, count).join(' '), maxPrice: maxPriceVnd ?? undefined, pageSize: HIT_LIMIT }));
    if (result.items.length) return result.items;
  }
  return [];
}

/** Meaning-based search over the product chunks that mirror the catalogue ("áo đi làm màu nhã"). Empty when embeddings are unavailable. */
async function semanticProductCodes(query: string): Promise<string[]> {
  try {
    const { literal } = await embedQuery(query, SEMANTIC_TIMEOUT_MS);
    const rows = await sql<{ source_id: string; similarity: number }[]>`
      SELECT c.source_id, 1 - (c.embedding <=> ${literal}::vector) AS similarity
      FROM knowledge_chunks c JOIN knowledge_documents d ON d.active_version_id = c.document_version_id AND d.deleted_at IS NULL AND d.storage_key = 'db:catalog'
      WHERE c.source_type = 'product'
      ORDER BY c.embedding <=> ${literal}::vector LIMIT ${HIT_LIMIT * 2}
    `;
    return rows.filter((row) => row.similarity >= env.RETRIEVAL_MIN_SIMILARITY).map((row) => row.source_id.replace(/^product:/, ''));
  } catch (error) {
    logger.warn({ stage: 'search_products.semantic_unavailable', error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Product search for the agent: keyword and meaning-based results are merged (rank fusion). Price, sizes and stock always come
 * from the products tables, never from the indexed chunk text, so a stale index cannot show a wrong price.
 */
export async function searchProductsForAgent(query: string, maxPriceVnd: number | null): Promise<AgentProductHit[]> {
  const [keyword, semanticCodes] = await Promise.all([keywordProducts(query, maxPriceVnd), semanticProductCodes(query)]);
  const known = new Map(keyword.map((card) => [card.code, card]));
  const order = mergeRanked([keyword.map((card) => card.code), semanticCodes], HIT_LIMIT);
  const missing = order.filter((code) => !known.has(code));
  for (const card of await listStoreCardsByCodes(missing, maxPriceVnd)) known.set(card.code, card);
  return order.flatMap((code) => known.get(code) ?? []).map(toHit);
}

// ───────────── Cart ─────────────

export async function viewCartForThread(threadId: string): Promise<AgentCart> {
  const cart = await getCart(await visitorOfThread(threadId));
  return {
    source_id: 'cart:current',
    lines: cart.lines.map((line) => ({
      product_code: line.productCode, name: line.name, size: line.size, color: line.color, quantity: line.quantity,
      unit_price_vnd: line.unitPriceVnd, line_total_vnd: line.lineTotalVnd, issue: line.issue?.message ?? null,
    })),
    item_count: cart.itemCount, subtotal_vnd: cart.subtotalVnd, shipping_fee_vnd: cart.shippingFeeVnd, total_vnd: cart.totalVnd,
    free_shipping_from_vnd: cart.freeShippingFromVnd, can_checkout: cart.canCheckout,
  };
}

type VariantRow = { id: string; size: string; color: string; stock: number };

/** Finds the variant by product code + size (+ colour). Explains the available options when it does not exist. */
async function findVariant(productCode: string, size: string, color: string | null): Promise<VariantRow> {
  const code = productCode.trim().toUpperCase();
  const variants = await sql<VariantRow[]>`
    SELECT v.id, v.size, v.color, v.stock FROM product_variants v
    JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
    WHERE p.code = ${code} AND v.is_active AND p.status = 'active' AND p.deleted_at IS NULL AND c.is_active
    ORDER BY v.position, v.size, v.color
  `;
  if (!variants.length) throw new HttpError(`Không có sản phẩm ${code} đang bán.`, 404);
  const norm = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const sized = variants.filter((variant) => norm(variant.size) === norm(size));
  const matches = color?.trim() ? sized.filter((variant) => norm(variant.color) === norm(color)) : sized;
  if (matches.length === 1) return matches[0];
  const options = variants.map((variant) => `${variant.size} / ${variant.color} (${variant.stock > 0 ? `còn ${variant.stock}` : 'hết hàng'})`).join('; ');
  throw new HttpError(matches.length > 1
    ? `${code} size ${size} có nhiều màu; hãy hỏi khách chọn màu. Các phiên bản: ${options}.`
    : `Không có phiên bản ${code} size ${size}${color ? ` màu ${color}` : ''}. Các phiên bản đang bán: ${options}.`, 404);
}

export async function addToCartForThread(threadId: string, input: { productCode: string; size: string; color: string | null; quantity: number }) {
  const visitorId = await visitorOfThread(threadId);
  const variant = await findVariant(input.productCode, input.size, input.color);
  await addToCart(visitorId, { variantId: variant.id, quantity: input.quantity });
  return viewCartForThread(threadId);
}

/** Sets the quantity of one cart line; 0 removes it. */
export async function setCartQuantityForThread(threadId: string, input: { productCode: string; size: string; color: string | null; quantity: number }) {
  const visitorId = await visitorOfThread(threadId);
  if (input.quantity < 0 || input.quantity > MAX_PER_LINE) throw new HttpError(`Số lượng phải từ 0 đến ${MAX_PER_LINE}.`, 400);
  const variant = await findVariant(input.productCode, input.size, input.color);
  const [line] = await sql<{ id: string }[]>`SELECT id FROM cart_items WHERE visitor_id = ${visitorId} AND variant_id = ${variant.id}`;
  if (!line) throw new HttpError(`${input.productCode} (${variant.size} / ${variant.color}) chưa có trong giỏ hàng.`, 404);
  if (input.quantity === 0) await removeLine(visitorId, line.id); else await setLineQuantity(visitorId, line.id, input.quantity);
  return viewCartForThread(threadId);
}

// ───────────── Orders ─────────────

const FAILS_PER_THREAD = 5;
const FAILS_PER_CODE = 5;
const FAIL_WINDOW_SECONDS = 15 * 60;

/**
 * The agent may only discuss an order with someone who proves they own it: it was placed from this very browser, or
 * the caller knows the phone number on it. Failed phone guesses are throttled per thread and per order code, and
 * "no such order" and "wrong phone" look identical.
 */
export async function verifyOrderForThread(threadId: string, orderId: string, phone: string | null) {
  const code = orderId.trim().toUpperCase();
  const visitorId = await visitorOfThread(threadId);
  const keys = [[`agent-verify:thread:${threadId}`, FAILS_PER_THREAD], [`lookup:code:${code}`, FAILS_PER_CODE]] as const;
  for (const [key, limit] of keys) {
    if (!peekRateLimit(key, limit).allowed) return { verified: false as const, message: 'Xác minh sai quá nhiều lần. Vui lòng thử lại sau ít phút hoặc liên hệ cửa hàng.' };
  }
  const [row] = await sql<{ visitor_id: string | null; phone: string | null }[]>`SELECT visitor_id, phone FROM orders WHERE id = ${code}`;
  const given = phone ? normalizePhone(phone) : null;
  const owner = Boolean(row?.visitor_id && row.visitor_id === visitorId);
  const phoneMatches = Boolean(row?.phone && given && given === row.phone);
  if (!row || !(owner || phoneMatches)) {
    if (given) for (const [key, limit] of keys) takeRateLimit(key, limit, FAIL_WINDOW_SECONDS);
    return { verified: false as const, message: given || phone ? 'Không tìm thấy đơn hàng khớp mã đơn và số điện thoại này.' : 'Cần số điện thoại đặt hàng để xác minh đơn này. Hãy hỏi khách số điện thoại.' };
  }
  const order = await findOrder(code);
  return { verified: true as const, order: order! };
}

// ───────────── Customer-confirmed writes ─────────────

/** Loads the confirmation and checks it is bound to this thread and action. A finished one replays its stored result. */
async function usable(threadId: string, confirmationId: string, action: ConfirmationAction): Promise<{ row: ConfirmationRow; replay?: unknown }> {
  const row = await getConfirmation(confirmationId);
  if (!row || row.thread_id !== threadId || row.action !== action) throw new HttpError('Không tìm thấy xác nhận của khách cho thao tác này.', 404);
  if (row.status === 'executed' && row.result) return { row, replay: row.result };
  if (row.status !== 'confirmed') throw new HttpError(`Khách chưa xác nhận thao tác này (trạng thái: ${row.status}).`, 409);
  return { row };
}

/** Places the order the customer confirmed: the stored name/phone/address/payment, priced from the live cart. */
export async function checkoutConfirmed(threadId: string, confirmationId: string) {
  const { row, replay } = await usable(threadId, confirmationId, 'checkout');
  if (replay) return replay;
  const visitorId = await visitorOfThread(threadId);
  const cart = await viewCartForThread(threadId);
  if (cartFingerprint(cart) !== row.fingerprint) {
    await finishConfirmation(row.id, 'failed', { reason: 'cart_changed' });
    throw new HttpError('Giỏ hàng hoặc giá đã thay đổi sau khi khách xác nhận nên chưa đặt hàng. Hãy xem lại giỏ hàng và xin khách xác nhận lại.', 409);
  }
  if (!(await claimConfirmation(row.id, threadId, 'checkout'))) throw new HttpError('Xác nhận này đã được xử lý.', 409);
  const payload = row.payload as CheckoutPayload;
  try {
    const placed = await checkout(visitorId, { name: payload.name, phone: payload.phone, address: payload.address, note: payload.note, paymentMethod: payload.paymentMethod as 'COD', idempotencyKey: row.id });
    const order = await getCustomerOrder(placed.code, { visitorId });
    const result = {
      status: 'created', source_id: `order:${order.code}`, order_code: order.code, total_vnd: order.totalVnd, payment_method: order.paymentMethod, payment_status: order.paymentStatus,
      order_page: `/orders/${order.code}`,
      next_step: order.canPay ? `Đơn chưa thanh toán: khách mở ${`/orders/${order.code}`} để thanh toán online.` : 'Đơn COD: thanh toán khi nhận hàng.',
    };
    await finishConfirmation(row.id, 'executed', result);
    return result;
  } catch (error) {
    await finishConfirmation(row.id, 'failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Cancels the order the customer confirmed (still processing and unpaid; stock goes back). */
export async function cancelOrderConfirmed(threadId: string, confirmationId: string) {
  const { row, replay } = await usable(threadId, confirmationId, 'cancel_order');
  if (replay) return replay;
  const payload = row.payload as CancelPayload;
  const current = await findOrder(payload.orderCode);
  if (!current || orderFingerprint({ id: current.id, status: current.status, paymentStatus: current.paymentStatus }) !== row.fingerprint) {
    await finishConfirmation(row.id, 'failed', { reason: 'order_changed' });
    throw new HttpError('Đơn hàng đã thay đổi sau khi khách xác nhận nên chưa hủy. Hãy tra lại đơn và xin khách xác nhận lại.', 409);
  }
  if (!(await claimConfirmation(row.id, threadId, 'cancel_order'))) throw new HttpError('Xác nhận này đã được xử lý.', 409);
  try {
    const order = await cancelCustomerOrder(payload.orderCode, { visitorId: await visitorOfThread(threadId), phone: payload.phone ?? undefined });
    const result = { status: 'cancelled', source_id: `order:${order.code}`, order_code: order.code, order_status: order.status, payment_status: order.paymentStatus };
    await finishConfirmation(row.id, 'executed', result);
    return result;
  } catch (error) {
    await finishConfirmation(row.id, 'failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
