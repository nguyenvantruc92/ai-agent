import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { metrics, safely } from '@/lib/metrics';
import { outcomeOf } from '@/lib/telemetry';

export type BreakerState = 'closed' | 'open' | 'half_open';
export type BreakerMode = 'off' | 'observe' | 'enforce';
export type BreakerOptions = { failureThreshold: number; windowMs: number; openMs: number; halfOpenMax: number; now: () => number; mode: () => BreakerMode };

/** Thrown instead of calling a dependency whose breaker is open (enforce mode only). */
export class CircuitOpenError extends Error {
  override name = 'CircuitOpenError';
  constructor(readonly key: string, readonly retryInMs: number) { super(`${key} tạm thời không khả dụng (circuit open).`); }
}

/** Only outages trip a breaker: a business error (tool_error), a customer leaving (aborted) or a refused call do not. */
export const isOutage = (error: unknown, signal?: AbortSignal) =>
  !(error instanceof CircuitOpenError) && ['failed', 'timeout'].includes(outcomeOf(error, signal));

const stateValue: Record<BreakerState, number> = { closed: 0, half_open: 1, open: 2 };

/**
 * closed → open after `failureThreshold` outages within `windowMs`; open → half_open after `openMs`, letting
 * `halfOpenMax` trial calls through; a success closes it, an outage re-opens it. State is per process on purpose:
 * each process sees its own connectivity. In `observe` mode the state is tracked and reported but calls are never
 * blocked, which is how it is rolled out before `enforce`.
 */
export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt = 0;
  private trials = 0;
  state: BreakerState = 'closed';

  constructor(readonly key: string, private readonly options: BreakerOptions) {}

  private transition(next: BreakerState) {
    if (next === this.state) return;
    const previous = this.state;
    this.state = next;
    if (next === 'open') { this.openedAt = this.options.now(); this.trials = 0; }
    if (next === 'half_open') this.trials = 0;
    if (next === 'closed') this.failures = [];
    logger.warn({ stage: 'circuit.state_changed', circuit: this.key, from: previous, to: next, mode: this.options.mode() });
    safely(() => metrics.circuitState.set({ circuit: this.key }, stateValue[next]));
  }

  /** Current state, moving open → half_open once the open period is over. */
  current(): BreakerState {
    if (this.state === 'open' && this.options.now() - this.openedAt >= this.options.openMs) this.transition('half_open');
    return this.state;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const mode = this.options.mode();
    if (mode === 'off') return fn();
    const state = this.current();
    if (mode === 'enforce') {
      if (state === 'open') throw new CircuitOpenError(this.key, this.openedAt + this.options.openMs - this.options.now());
      if (state === 'half_open' && this.trials >= this.options.halfOpenMax) throw new CircuitOpenError(this.key, this.options.openMs);
    }
    if (state === 'half_open') this.trials += 1;
    try {
      const result = await fn();
      if (this.state !== 'closed') this.transition('closed');
      return result;
    } catch (error) {
      if (isOutage(error, signal)) this.recordOutage();
      else if (this.state === 'half_open') this.transition('closed'); // the dependency answered
      throw error;
    }
  }

  private recordOutage() {
    const now = this.options.now();
    if (this.state === 'half_open') { this.transition('open'); return; }
    this.failures = [...this.failures.filter((at) => now - at < this.options.windowMs), now];
    if (this.failures.length >= this.options.failureThreshold) this.transition('open');
  }
}

const defaults = (): Omit<BreakerOptions, 'now' | 'mode'> => ({
  failureThreshold: env.CIRCUIT_FAILURE_THRESHOLD, windowMs: env.CIRCUIT_WINDOW_SECONDS * 1_000, openMs: env.CIRCUIT_OPEN_SECONDS * 1_000, halfOpenMax: 1,
});

const holder = globalThis as typeof globalThis & { __fashionBreakers?: Map<string, CircuitBreaker> };
const breakers = holder.__fashionBreakers ??= new Map<string, CircuitBreaker>();

/** One breaker per dependency key (`openai:chat`, `openai:embedding`, `mcp:builtin`, `mcp:<slug>`), shared in the process. */
export function breakerFor(key: string) {
  let breaker = breakers.get(key);
  if (!breaker) {
    breaker = new CircuitBreaker(key, { ...defaults(), now: () => Date.now(), mode: () => env.CIRCUIT_BREAKER_MODE });
    breakers.set(key, breaker);
  }
  return breaker;
}

export const breakerStates = () => [...breakers.values()].map((breaker) => ({ key: breaker.key, state: breaker.current() }));
/** Tests only. */
export const resetBreakers = () => breakers.clear();

export type RetryOptions = { attempts: number; baseMs: number; maxMs: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; random?: () => number };

/**
 * Bounded retry with full jitter (delay = random × min(maxMs, baseMs × 2^attempt)). Retries outages only, never a
 * business error, a refused breaker or a call the customer aborted. Use it for READ operations only: a write retried
 * after a timeout may already have happened.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt + 1 >= options.attempts || !isOutage(error, options.signal)) throw error;
      await sleep(Math.round(random() * Math.min(options.maxMs, options.baseMs * 2 ** attempt)));
    }
  }
}
