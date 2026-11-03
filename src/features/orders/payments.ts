import { randomUUID } from 'node:crypto';

/**
 * Seam for a real payment provider. `initiate` registers the attempt and returns the provider reference;
 * the outcome then arrives out of band (a webhook in production). The simulated gateway has no network:
 * the customer chooses success or failure on the order page, which calls `payCustomerOrder`.
 */
export interface PaymentGateway {
  readonly name: string;
  initiate(order: { code: string; amountVnd: number; method: string }): Promise<{ providerRef: string }>;
}

export const simulatedGateway: PaymentGateway = {
  name: 'simulated',
  async initiate() { return { providerRef: `SIM-${randomUUID().slice(0, 8).toUpperCase()}` }; },
};

export const paymentGateway: PaymentGateway = simulatedGateway;
