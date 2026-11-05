import { HumanMessage } from '@langchain/core/messages';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { afterEach, describe, expect, it } from 'vitest';
import { compileAgentGraph } from '@/features/agent/graph';
import { assertPaymentMethodAvailable, availablePaymentMethods } from '@/features/orders/payment-availability';
import { env, envFlag } from '@/lib/env';
import { fakeApprovals, fakeConfirmations, fakeGateway, NOW, scriptedModel, testAgent } from './fakes';

const initial = env.PAYMENT_SIMULATION_ENABLED;
afterEach(() => { env.PAYMENT_SIMULATION_ENABLED = initial; });

describe('envFlag', () => {
  it.each([
    [undefined, true, true], ['', false, false], ['  ', true, true],
    ['true', false, true], ['TRUE', false, true], ['1', false, true], ['on', false, true], ['yes', false, true],
    ['false', true, false], ['False', true, false], ['0', true, false], ['off', true, false], ['no', true, false],
  ])('parses %j (fallback %s) as %s', (value, fallback, expected) => {
    expect(envFlag(fallback).parse(value)).toBe(expected);
  });

  it('rejects an unrecognised value instead of guessing', () => {
    expect(envFlag(false).safeParse('maybe').success).toBe(false);
  });
});

describe('online payment availability', () => {
  it('offers only COD and refuses online methods when the simulation is off', () => {
    env.PAYMENT_SIMULATION_ENABLED = false;
    expect(availablePaymentMethods()).toEqual(['COD']);
    expect(() => assertPaymentMethodAvailable('COD')).not.toThrow();
    expect(() => assertPaymentMethodAvailable('card')).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => assertPaymentMethodAvailable('bank_transfer')).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('offers every method when the simulation is on', () => {
    env.PAYMENT_SIMULATION_ENABLED = true;
    expect(availablePaymentMethods()).toEqual(['COD', 'bank_transfer', 'card']);
    expect(() => assertPaymentMethodAvailable('card')).not.toThrow();
  });
});

describe('agent checkout with online payment off', () => {
  it('refuses before asking the customer to confirm, so no confirmation is created', async () => {
    env.PAYMENT_SIMULATION_ENABLED = false;
    const script = scriptedModel([
      { name: 'add_to_cart', args: { product_id: 'PL-002', size: 'M', color: 'Trắng', quantity: 1 } },
      { name: 'checkout', args: { name: 'Nguyễn Văn An', phone: '0912 345 678', address: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', note: null, payment_method: 'card' } },
      { name: 'final_answer', args: { answer: 'Hiện cửa hàng chỉ nhận COD, bạn có đồng ý không?', cited_source_ids: [], insufficient_information: false } },
    ]);
    const { gateway, placed } = fakeGateway();
    const confirmations = fakeConfirmations();
    const graph = compileAgentGraph({ model: script.model, gateway, approvals: fakeApprovals().store, confirmations: confirmations.store, loadAgent: async () => testAgent(), now: () => NOW }, new MemorySaver(), new InMemoryStore());

    const message = 'Mua 1 áo polo trắng size M, tên Nguyễn Văn An, SĐT 0912 345 678, giao 12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh, trả bằng thẻ';
    await graph.invoke({ messages: [new HumanMessage(message)], userId: 'visitor-hash', route: null, finalAnswer: null, turnSources: [], modelCalls: 0, toolCalls: 0, approvalStatus: 'none' as const }, { configurable: { thread_id: 't-pay-off', trace_id: 'test' } });

    expect(confirmations.rows).toHaveLength(0);
    expect(placed).toHaveLength(0);
    const toolResults = script.seen.at(-1)!.map((item) => String(item.content)).join('\n');
    expect(toolResults).toContain('payment_unavailable');
  });
});
