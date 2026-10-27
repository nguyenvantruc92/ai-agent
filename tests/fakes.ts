import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ApprovalInput, ApprovalStore } from '@/features/agent/approvals';
import type { CreatedRequest, ToolGateway } from '@/features/agent/gateway';
import type { AgentModel } from '@/features/agent/graph';
import type { answerWithRag } from '@/features/chat/rag-answer';
import { idempotencyKey } from '@/features/orders/policy';
import { seedOrders } from '@/features/orders/seed-data';
import type { Order, Product, RequestProposal } from '@/features/orders/types';

export const NOW = new Date('2026-10-27T10:00:00Z');
const DAY = 24 * 60 * 60 * 1_000;

export const products: Record<string, Product> = {
  'SM-001': { productId: 'SM-001', name: 'Áo sơ mi Oxford trắng dáng regular', category: 'Áo sơ mi', priceVnd: 499000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Trắng'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
  'SM-002': { productId: 'SM-002', name: 'Áo sơ mi Oxford xanh nhạt dáng regular', category: 'Áo sơ mi', priceVnd: 499000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Xanh nhạt'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
  'PL-002': { productId: 'PL-002', name: 'Áo polo pique trắng', category: 'Áo polo', priceVnd: 389000, sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Trắng'], stockStatus: 'Còn hàng', updatedAt: '2026-10-27' },
};

/** In-memory orders built from the real seed data, with dates relative to NOW. */
export function fakeGateway() {
  const created: { proposal: RequestProposal; approvalId: string }[] = [];
  const requests = new Map<string, CreatedRequest>();
  const order = (id: string): Order | null => {
    const seed = seedOrders.find((item) => item.id === id);
    if (!seed) return null;
    return {
      id: seed.id,
      status: seed.status,
      orderedAt: new Date(NOW.getTime() - seed.orderedDaysAgo * DAY).toISOString(),
      deliveredAt: seed.deliveredDaysAgo === null ? null : new Date(NOW.getTime() - seed.deliveredDaysAgo * DAY).toISOString(),
      paymentMethod: seed.paymentMethod,
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
      })),
    };
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
  };
  return { gateway, created };
}

export function fakeApprovals() {
  const rows: (ApprovalInput & { id: string; status: 'pending' | 'approved' })[] = [];
  const store: ApprovalStore = {
    async ensure(input) {
      const existing = rows.find((row) => row.idempotencyKey === input.idempotencyKey);
      if (existing) return { id: existing.id, threadId: existing.threadId, status: existing.status };
      const row = { ...input, id: `approval-${rows.length + 1}`, status: 'pending' as const };
      rows.push(row);
      return { id: row.id, threadId: row.threadId, status: row.status };
    },
  };
  return { store, rows };
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
