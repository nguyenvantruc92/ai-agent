import { describe, expect, it } from 'vitest';
import { availableActions, checkTransition, type OrderStatus, type PaymentStatus } from '@/features/orders/order-flow';

const order = (status: OrderStatus, paymentMethod = 'COD', paymentStatus: PaymentStatus = 'unpaid') => ({ status, paymentMethod, paymentStatus });
const ok = (flow: ReturnType<typeof order>, action: 'ship' | 'deliver' | 'cancel') => checkTransition(flow, action).ok;

describe('order state machine', () => {
  it('moves processing → shipping → delivered', () => {
    expect([ok(order('processing'), 'ship'), ok(order('processing'), 'deliver'), ok(order('shipping'), 'deliver'), ok(order('shipping'), 'ship')]).toEqual([true, false, true, false]);
  });

  it('only allows cancelling before delivery', () => {
    expect([ok(order('processing'), 'cancel'), ok(order('shipping'), 'cancel'), ok(order('delivered'), 'cancel'), ok(order('cancelled'), 'cancel')]).toEqual([true, true, false, false]);
  });

  it('freezes delivered and cancelled orders', () => {
    for (const status of ['delivered', 'cancelled'] as const) for (const action of ['ship', 'deliver', 'cancel'] as const) expect(ok(order(status), action)).toBe(false);
  });

  it('makes online orders wait for payment before shipping, but not COD', () => {
    expect(ok(order('processing', 'card', 'unpaid'), 'ship')).toBe(false);
    expect(ok(order('processing', 'bank_transfer', 'failed'), 'ship')).toBe(false);
    expect(ok(order('processing', 'card', 'paid'), 'ship')).toBe(true);
    expect(ok(order('processing', 'COD', 'unpaid'), 'ship')).toBe(true);
  });

  it('explains why an action is unavailable', () => {
    const blocked = checkTransition(order('processing', 'card'), 'ship');
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.message).toContain('chưa được thanh toán');
    expect(availableActions(order('shipping')).filter((item) => item.check.ok).map((item) => item.action)).toEqual(['deliver', 'cancel']);
  });
});
