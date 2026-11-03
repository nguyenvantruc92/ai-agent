import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ApprovalInput, ApprovalStore } from '@/features/agent/approvals';
import type { ConfirmationInput, ConfirmationStore } from '@/features/agent/confirmations';
import type { CreatedRequest, ToolGateway } from '@/features/agent/gateway';
import type { AgentCart } from '@/features/agent/shop-types';
import type { AgentModel } from '@/features/agent/graph';
import type { answerWithRag } from '@/features/chat/rag-answer';
import { idempotencyKey } from '@/features/orders/policy';
import { demoPhone } from '@/features/orders/phone';
import { seedOrders } from '@/features/orders/seed-data';
import type { Order, Product, RequestProposal } from '@/features/orders/types';

export const NOW = new Date('2026-10-27T10:00:00Z');
const DAY = 24 * 60 * 60 * 1_000;

export const products: Record<string, Product> = {
  'SM-001': { productId: 'SM-001', name: 'Áo sơ mi Oxford trắng dáng regular', category: 'Áo sơ mi', priceVnd: 499000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Trắng'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
  'SM-002': { productId: 'SM-002', name: 'Áo sơ mi Oxford xanh nhạt dáng regular', category: 'Áo sơ mi', priceVnd: 499000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Xanh nhạt'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
  'PL-002': { productId: 'PL-002', name: 'Áo polo pique trắng', category: 'Áo polo', priceVnd: 389000, sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Trắng'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
};

/** In-memory orders built from the real seed data, with dates relative to NOW; also a tiny cart and order book for the shopping tools. */
export function fakeGateway() {
  const created: { proposal: RequestProposal; approvalId: string }[] = [];
  const requests = new Map<string, CreatedRequest>();
  const cart: { code: string; size: string; color: string; quantity: number }[] = [];
  const placed: { confirmationId: string; code: string; lines: typeof cart }[] = [];
  const cancelled: { confirmationId: string; code: string }[] = [];
  const cancelledCodes = new Set<string>();
  const order = (id: string): Order | null => {
    const seed = seedOrders.find((item) => item.id === id);
    if (!seed) return null;
    const status = cancelledCodes.has(id) ? 'cancelled' : seed.status;
    return {
      id: seed.id,
      status,
      orderedAt: new Date(NOW.getTime() - seed.orderedDaysAgo * DAY).toISOString(),
      deliveredAt: seed.deliveredDaysAgo === null ? null : new Date(NOW.getTime() - seed.deliveredDaysAgo * DAY).toISOString(),
      paymentMethod: seed.paymentMethod,
      paymentStatus: 'unpaid',
      canCancel: status === 'processing',
      items: seed.items.map((item) => ({ ...item, discountPercent: item.discountPercent ?? 0, isOpened: item.isOpened ?? false })),
      requests: created.filter((item) => item.proposal.orderId === id).map((item) => ({
        id: requests.get(idempotencyKey(item.proposal))!.requestId,
        type: item.proposal.action,
        productId: item.proposal.productId,
        requestedSize: item.proposal.action === 'exchange_size' ? item.proposal.requestedSize : null,
        reason: item.proposal.action === 'return' ? item.proposal.reason : null,
        status: 'created',
        idempotencyKey: idempotencyKey(item.proposal),
        createdAt: NOW.toISOString(),
        itemSize: item.proposal.itemSize ?? null,
        itemColor: item.proposal.itemColor ?? null,
      })),
    };
  };
  const viewCart = (): AgentCart => {
    const lines = cart.map((line) => {
      const product = products[line.code];
      return { product_code: line.code, name: product.name, size: line.size, color: line.color, quantity: line.quantity, unit_price_vnd: product.priceVnd, line_total_vnd: product.priceVnd * line.quantity, issue: null };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.line_total_vnd, 0);
    const shipping = subtotal === 0 || subtotal >= 799000 ? 0 : 30000;
    return { source_id: 'cart:current', lines, item_count: lines.reduce((sum, line) => sum + line.quantity, 0), subtotal_vnd: subtotal, shipping_fee_vnd: shipping, total_vnd: subtotal + shipping, free_shipping_from_vnd: 799000, can_checkout: lines.length > 0 };
  };
  const addLine = (code: string, size: string, color: string | null, quantity: number) => {
    const product = products[code.toUpperCase()];
    if (!product) throw new Error(`Không có sản phẩm ${code} đang bán.`);
    const resolvedColor = color ?? product.colors[0];
    const existing = cart.find((line) => line.code === product.productId && line.size === size && line.color === resolvedColor);
    if (existing) existing.quantity = quantity; else cart.push({ code: product.productId, size, color: resolvedColor, quantity });
    return viewCart();
  };
  const gateway: ToolGateway = {
    lookupOrder: async (id) => order(id),
    lookupProduct: async (id) => products[id] ?? null,
    searchPolicy: async () => [{ source_id: 'policy:chinh-sach-doi-size-va-doi-san-pham:1', title: 'Thời hạn đổi size', content: 'Đổi trong 7 ngày.', similarity: 0.6, updated_at: '2026-10-27' }],
    createRequest: async (proposal, approvalId) => {
      const key = idempotencyKey(proposal);
      const existing = requests.get(key);
      if (existing) return { ...existing, created: false };
      const result = { requestId: `req-${requests.size + 1}`, status: 'created', created: true, createdAt: NOW.toISOString() };
      requests.set(key, result);
      created.push({ proposal, approvalId });
      return result;
    },
    searchProducts: async (query) => Object.values(products).filter((product) => product.name.toLowerCase().includes(query.toLowerCase().split(' ').at(-1) ?? '')).map((product) => ({
      source_id: `product:${product.productId}`, product_id: product.productId, name: product.name, category: product.category, price_vnd: product.priceVnd, compare_at_price_vnd: null, colors: product.colors, sizes_in_stock: product.sizes, in_stock: true,
    })),
    verifyOrder: async (_thread, id, phone) => {
      const found = order(id);
      return found && phone && phone.replace(/\D/g, '') === demoPhone(id) ? { verified: true, order: found } : { verified: false, message: phone ? 'Không tìm thấy đơn hàng khớp mã đơn và số điện thoại này.' : 'Cần số điện thoại đặt hàng để xác minh đơn này.' };
    },
    viewCart: async () => viewCart(),
    addToCart: async (_thread, line) => addLine(line.productId, line.size, line.color, line.quantity),
    setCartQuantity: async (_thread, line) => {
      const index = cart.findIndex((item) => item.code === line.productId && item.size === line.size);
      if (index < 0) throw new Error('Chưa có trong giỏ hàng.');
      if (line.quantity === 0) cart.splice(index, 1); else cart[index].quantity = line.quantity;
      return viewCart();
    },
    checkout: async (_thread, confirmationId) => {
      const code = `FT-2026-${2001 + placed.length}`;
      placed.push({ confirmationId, code, lines: cart.splice(0) });
      return { status: 'created', source_id: `order:${code}`, order_code: code, total_vnd: 0, payment_method: 'COD', payment_status: 'unpaid' };
    },
    cancelOrder: async (_thread, confirmationId) => {
      const code = 'FT-2026-1005';
      cancelled.push({ confirmationId, code });
      cancelledCodes.add(code);
      return { status: 'cancelled', source_id: `order:${code}`, order_code: code };
    },
  };
  return { gateway, created, cart, placed, cancelled };
}

export function fakeConfirmations() {
  const rows: (ConfirmationInput & { id: string })[] = [];
  const store: ConfirmationStore = {
    async create(input) {
      const row = { ...input, id: `confirmation-${rows.length + 1}` };
      rows.push(row);
      return { id: row.id };
    },
  };
  return { store, rows };
}

export function fakeApprovals() {
  const rows: (ApprovalInput & { id: string; status: 'pending' | 'approved' | 'rejected' | 'expired' })[] = [];
  const store: ApprovalStore = {
    async ensure(input) {
      // Like the real table: only a pending/approved approval counts as live for the idempotency key.
      const existing = rows.find((row) => row.idempotencyKey === input.idempotencyKey && (row.status === 'pending' || row.status === 'approved'));
      if (existing) return { id: existing.id, threadId: existing.threadId, status: existing.status };
      const row = { ...input, id: `approval-${rows.length + 1}`, status: 'pending' as const };
      rows.push(row);
      return { id: row.id, threadId: row.threadId, status: row.status };
    },
  };
  const decide = (id: string, status: 'approved' | 'rejected' | 'expired') => { rows.find((row) => row.id === id)!.status = status; };
  return { store, rows, decide };
}

type Step = { name: string; args: Record<string, unknown> };

/** A model that replays scripted tool calls, one per invocation. */
export function scriptedModel(steps: Step[]) {
  const seen: BaseMessage[][] = [];
  const model: AgentModel = {
    async invoke(messages) {
      seen.push(messages);
      const step = steps.shift();
      if (!step) throw new Error('Script exhausted');
      return new AIMessage({ content: '', tool_calls: [{ id: `call-${seen.length}`, name: step.name, args: step.args, type: 'tool_call' }] });
    },
  };
  return { model, seen, remaining: steps };
}

export const fakeRag: typeof answerWithRag = async ({ message }) => ({
  answer: `RAG: ${message}`,
  citedSourceIds: ['product:PL-002'],
  insufficientInformation: false,
  sources: [{ id: 'product:PL-002', title: 'Áo polo pique trắng', type: 'product' }],
  diagnostics: { route: 'rag', validation: 'valid', promptSourceIds: ['product:PL-002'], modelCitations: ['product:PL-002'], inputTokens: 0, outputTokens: 0 },
});
