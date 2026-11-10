/** Fake phone for a demo order, e.g. FT-2026-1001 -> 0900261001 (same rule as migration 0005). Pure, so tests can use it. */
export const demoPhone = (orderId: string) => `0900${orderId.replace(/\D/g, '').slice(-6)}`;
