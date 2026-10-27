import { describe, expect, it } from 'vitest';
import { chooseRoute } from '@/features/agent/router';
import { checkRequest, idempotencyKey, returnReasonStated } from '@/features/orders/policy';
import type { Order, Product } from '@/features/orders/types';
import { fakeGateway, NOW, products } from './fakes';

const { gateway } = fakeGateway();
const order = async (id: string) => (await gateway.lookupOrder(id, 't'))!;
const product = (id: string, extra: Partial<Product> = {}): Product => ({ ...(products[id] ?? { productId: id, name: id, category: 'Phụ kiện', priceVnd: 1, sizes: ['Freesize'], colors: [], stockStatus: 'Còn hàng', updatedAt: '' }), ...extra });
const exchange = (orderId: string, productId: string, requestedSize: string) => ({ action: 'exchange_size' as const, orderId, productId, requestedSize });

describe('checkRequest', () => {
  it('accepts a size exchange within 7 days for an available size', async () => {
    const result = checkRequest(exchange('FT-2026-1001', 'SM-001', 'L'), await order('FT-2026-1001'), product('SM-001'), NOW);
    expect(result).toMatchObject({ ok: true, idempotencyKey: 'FT-2026-1001:SM-001:exchange_size:L' });
  });

  it.each([
    ['order_not_found', exchange('FT-2026-1099', 'SM-001', 'L'), null],
    ['item_not_in_order', exchange('FT-2026-1001', 'PL-002', 'L'), 'FT-2026-1001'],
    ['order_not_delivered', exchange('FT-2026-1004', 'JK-001', 'M'), 'FT-2026-1004'],
    ['window_expired', exchange('FT-2026-1003', 'SM-002', 'M'), 'FT-2026-1003'],
    ['excluded_item', exchange('FT-2026-1006', 'PK-004', '43–46'), 'FT-2026-1006'],
    ['excluded_item', exchange('FT-2026-1007', 'QT-005', '31'), 'FT-2026-1007'],
    ['same_size', exchange('FT-2026-1001', 'SM-001', 'm'), 'FT-2026-1001'],
    ['size_not_available', exchange('FT-2026-1001', 'SM-001', 'XXL'), 'FT-2026-1001'],
  ])('rejects with %s', async (code, proposal, orderId) => {
    const result = checkRequest(proposal, orderId ? await order(orderId) : null, product(proposal.productId), NOW);
    expect(result).toMatchObject({ ok: false, code });
  });

  it('rejects opened accessories and returns for reasons outside the policy', async () => {
    expect(checkRequest(exchange('FT-2026-1006', 'PK-003', 'Freesize'), await order('FT-2026-1006'), product('PK-003', { category: 'Phụ kiện' }), NOW)).toMatchObject({ ok: false, code: 'excluded_item' });
    expect(checkRequest({ action: 'return', orderId: 'FT-2026-1002', productId: 'PL-002', reason: 'changed_mind' }, await order('FT-2026-1002'), product('PL-002'), NOW)).toMatchObject({ ok: false, code: 'invalid_reason' });
    expect(checkRequest({ action: 'return', orderId: 'FT-2026-1009', productId: 'KN-001', reason: 'manufacturing_defect' }, await order('FT-2026-1009'), null, NOW)).toMatchObject({ ok: true, idempotencyKey: 'FT-2026-1009:KN-001:return' });
  });

  it('returns the existing request for an identical one and refuses a different one for the same item', () => {
    const base: Order = { id: 'FT-2026-1008', status: 'delivered', orderedAt: NOW.toISOString(), deliveredAt: NOW.toISOString(), paymentMethod: 'COD', items: [{ productId: 'SM-003', productName: 'Áo sơ mi linen be', size: 'M', color: 'Be', quantity: 1, unitPriceVnd: 559000, discountPercent: 0, isOpened: false }], requests: [] };
    const existing = { ...base, requests: [{ id: 'req-1', type: 'exchange_size' as const, productId: 'SM-003', requestedSize: 'L', reason: null, status: 'created', idempotencyKey: idempotencyKey(exchange('FT-2026-1008', 'SM-003', 'L')), createdAt: '' }] };
    const sm003 = product('SM-003', { category: 'Áo sơ mi', sizes: ['M', 'L', 'XL'] });
    expect(checkRequest(exchange('FT-2026-1008', 'SM-003', 'L'), existing, sm003, NOW)).toMatchObject({ ok: true, existingRequestId: 'req-1' });
    expect(checkRequest(exchange('FT-2026-1008', 'SM-003', 'XL'), existing, sm003, NOW)).toMatchObject({ ok: false, code: 'already_requested' });
  });
});

describe('chooseRoute', () => {
  it('sends order and exchange intents to the agent', () => {
    expect(chooseRoute('Đơn FT-2026-1001 của tôi giao chưa?', { orderId: null })).toBe('agent');
    expect(chooseRoute('Tôi muốn đổi áo sang size L', { orderId: null })).toBe('agent');
    expect(chooseRoute('Kiểm tra đơn hàng giúp mình', { orderId: null })).toBe('agent');
  });

  it('keeps catalog and policy questions on the RAG path', () => {
    expect(chooseRoute('Tôi có thể đổi size sau 10 ngày không?', { orderId: null })).toBe('rag');
    expect(chooseRoute('Áo polo trắng giá bao nhiêu?', { orderId: null })).toBe('rag');
    expect(chooseRoute('Chào bạn', { orderId: 'FT-2026-1001' })).toBe('rag');
  });

  it('keeps short follow-ups on the agent once an order is in context', () => {
    expect(chooseRoute('Còn size L không?', { orderId: 'FT-2026-1001' })).toBe('agent');
    expect(chooseRoute('Shop có những phương thức thanh toán nào?', { orderId: 'FT-2026-1001' })).toBe('rag');
  });
});

describe('returnReasonStated', () => {
  it('requires the customer to state the return reason', () => {
    expect(returnReasonStated('manufacturing_defect', 'Áo len bị bung chỉ do lỗi sản xuất')).toBe(true);
    expect(returnReasonStated('wrong_size_or_color', 'Tôi đặt màu trắng nhưng nhận sai màu')).toBe(true);
    expect(returnReasonStated('wrong_item', 'Shop giao nhầm sản phẩm cho tôi')).toBe(true);
    expect(returnReasonStated('manufacturing_defect', 'Tôi không thích nữa, muốn trả hàng hoàn tiền')).toBe(false);
    expect(returnReasonStated('wrong_item', 'Tôi nhận sai màu')).toBe(false);
  });
});
