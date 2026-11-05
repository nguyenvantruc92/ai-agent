import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardedToolCall } from '@/features/agent/gateway';
import { compileAgentGraph, type AgentModel } from '@/features/agent/graph';
import { env } from '@/lib/env';
import { breakerFor, CircuitBreaker, CircuitOpenError, resetBreakers, withRetry, type BreakerMode } from '@/lib/resilience';
import { ToolReportedError } from '@/lib/telemetry';
import { fakeApprovals, fakeConfirmations, fakeGateway, NOW, testAgent } from './fakes';

const saved = { ...env };
beforeEach(() => resetBreakers());
afterEach(() => { Object.assign(env, saved); resetBreakers(); });

const outage = () => new Error('connect ECONNREFUSED');
function breaker(mode: BreakerMode = 'enforce') {
  const clock = { now: 0 };
  const instance = new CircuitBreaker('test', { failureThreshold: 3, windowMs: 10_000, openMs: 30_000, halfOpenMax: 1, now: () => clock.now, mode: () => mode });
  const fail = () => instance.run(async () => { throw outage(); }).catch((error: unknown) => error);
  return { instance, clock, fail };
}

describe('CircuitBreaker', () => {
  it('opens after the threshold within the window, then refuses without calling the dependency', async () => {
    const { instance, fail } = breaker();
    for (let index = 0; index < 3; index += 1) await fail();
    expect(instance.current()).toBe('open');
    let called = false;
    await expect(instance.run(async () => { called = true; })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it('forgets outages older than the window', async () => {
    const { instance, clock, fail } = breaker();
    await fail(); await fail();
    clock.now = 11_000;
    await fail();
    expect(instance.current()).toBe('closed');
  });

  it('lets one trial through after the open period: success closes, an outage re-opens', async () => {
    const { instance, clock, fail } = breaker();
    for (let index = 0; index < 3; index += 1) await fail();
    clock.now = 30_000;
    expect(instance.current()).toBe('half_open');
    await fail();
    expect(instance.current()).toBe('open');

    clock.now = 60_000;
    const trial = instance.run(() => new Promise((resolve) => setTimeout(() => resolve('ok'), 5)));
    await expect(instance.run(async () => 'second')).rejects.toBeInstanceOf(CircuitOpenError);
    await expect(trial).resolves.toBe('ok');
    expect(instance.current()).toBe('closed');
  });

  it('does not count business errors or aborted calls as outages', async () => {
    const { instance } = breaker();
    const controller = new AbortController();
    controller.abort();
    for (let index = 0; index < 5; index += 1) {
      await instance.run(async () => { throw new ToolReportedError('MCP verify_order: không tìm thấy đơn'); }).catch(() => undefined);
      await instance.run(async () => { throw new Error('aborted'); }, controller.signal).catch(() => undefined);
    }
    expect(instance.current()).toBe('closed');
  });

  it('in observe mode tracks the state but never blocks a call', async () => {
    const { instance, fail } = breaker('observe');
    for (let index = 0; index < 3; index += 1) await fail();
    expect(instance.current()).toBe('open');
    await expect(instance.run(async () => 'called')).resolves.toBe('called');
    expect(instance.current()).toBe('closed');
  });
});

describe('withRetry', () => {
  const fast = { attempts: 2, baseMs: 100, maxMs: 1_000, sleep: async () => undefined };

  it('retries an outage once, with a jittered delay within the bound', async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(async () => { calls += 1; if (calls === 1) throw outage(); return 'ok'; }, { ...fast, sleep: async (ms) => { delays.push(ms); }, random: () => 0.5 });
    expect({ result, calls, delays }).toEqual({ result: 'ok', calls: 2, delays: [50] });
  });

  it('never retries a business error, a refused breaker or an aborted call, and stops after the last attempt', async () => {
    for (const error of [new ToolReportedError('x'), new CircuitOpenError('k', 1)]) {
      let calls = 0;
      await expect(withRetry(async () => { calls += 1; throw error; }, fast)).rejects.toBe(error);
      expect(calls).toBe(1);
    }
    const controller = new AbortController();
    controller.abort();
    let aborted = 0;
    await expect(withRetry(async () => { aborted += 1; throw outage(); }, { ...fast, signal: controller.signal })).rejects.toThrow();
    expect(aborted).toBe(1);
    let calls = 0;
    await expect(withRetry(async () => { calls += 1; throw outage(); }, fast)).rejects.toThrow('ECONNREFUSED');
    expect(calls).toBe(2);
  });
});

describe('built-in MCP calls', () => {
  it('retries a read tool once, but calls a write tool and verify_order exactly once', async () => {
    const counter = (failures: number) => {
      const state = { calls: 0 };
      return { state, run: async () => { state.calls += 1; if (state.calls <= failures) throw outage(); return 'ok'; } };
    };
    const read = counter(1);
    await expect(guardedToolCall('lookup_order', 't', read.run)).resolves.toBe('ok');
    expect(read.state.calls).toBe(2);
    for (const name of ['checkout', 'cancel_order', 'add_to_cart', 'create_exchange_request', 'verify_order']) {
      const write = counter(1);
      await expect(guardedToolCall(name, 't', write.run)).rejects.toThrow('ECONNREFUSED');
      expect(write.state.calls).toBe(1);
    }
  });

  it('stops calling MCP once its breaker is open (enforce)', async () => {
    env.CIRCUIT_BREAKER_MODE = 'enforce';
    env.CIRCUIT_FAILURE_THRESHOLD = 2;
    let calls = 0;
    const failing = async () => { calls += 1; throw outage(); };
    await guardedToolCall('checkout', 't', failing).catch(() => undefined);
    await guardedToolCall('checkout', 't', failing).catch(() => undefined);
    await expect(guardedToolCall('checkout', 't', failing)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(2);
  });
});

describe('agent graph with the model breaker open', () => {
  const turn = (message: string) => ({ messages: [new HumanMessage(message)], userId: 'visitor-hash', route: null, finalAnswer: null, turnSources: [], modelCalls: 0, toolCalls: 0, approvalStatus: 'none' as const });
  const config = { configurable: { thread_id: 't-breaker', trace_id: 'test' } };

  it('answers "temporarily unavailable" without calling the model, and keeps every tool call paired', async () => {
    Object.assign(env, { CIRCUIT_BREAKER_MODE: 'enforce', CIRCUIT_FAILURE_THRESHOLD: 1 });
    let modelCalls = 0;
    const model: AgentModel = {
      async invoke() {
        modelCalls += 1;
        if (modelCalls === 1) return new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'search_products', args: { query: 'áo polo', max_price_vnd: null }, type: 'tool_call' }] });
        throw new Error('Request timed out.');
      },
    };
    const { gateway } = fakeGateway();
    const graph = compileAgentGraph({ model, gateway, approvals: fakeApprovals().store, confirmations: fakeConfirmations().store, loadAgent: async () => testAgent(), now: () => NOW }, new MemorySaver(), new InMemoryStore());

    // First turn: a tool runs, then the provider times out (that outage opens the breaker) and the turn fails.
    await expect(graph.invoke(turn('Có áo polo không?'), config)).rejects.toThrow('timed out');
    expect(breakerFor('openai:chat').current()).toBe('open');

    // Next turn: no model call, a plain answer, and the history stays valid for the provider.
    const state = await graph.invoke(turn('Còn không bạn?'), config);
    expect(modelCalls).toBe(2);
    expect(state.finalAnswer).toMatchObject({ insufficientInformation: true, diagnostics: { route: 'unavailable', validation: 'circuit_open' } });
    const toolCallIds = state.messages.flatMap((message: AIMessage) => (AIMessage.isInstance(message) ? message.tool_calls ?? [] : []).map((call) => call.id));
    const answeredIds = state.messages.filter((message: ToolMessage) => ToolMessage.isInstance(message)).map((message: ToolMessage) => message.tool_call_id);
    expect(answeredIds).toEqual(toolCallIds);
  });
});
