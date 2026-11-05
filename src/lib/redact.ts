import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * The single place that decides what personal data looks like in logs and traces.
 * Tool results sent to the model are NOT redacted (the model needs the order data); only log/trace output is.
 * Names and street addresses cannot be detected reliably, so free text from customers is not logged at all;
 * this module is for the text that has to be logged anyway (error messages, opt-in debug text, summaries).
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;
// Vietnamese phone numbers with any separators: 0912345678, 0912 345 678, +84 912.345.678, (091) 234-5678.
// A leading 0 needs 9–10 more digits, so dates (05-11-2026), order codes (FT-2026-1001) and prices (799.000đ) stay readable.
const PHONE = /(?<![\w+])\(?(?:\+84|84|0)(?:[\s.()-]{0,2}\d){9,10}(?!\d)/g;
// Card/account numbers written in groups of four.
const GROUPED_NUMBER = /\b\d{4}(?:[ -]\d{4}){2,4}\b/g;
const LONG_NUMBER = /\b\d{9,}\b/g;

export function redactText(text: string) {
  return text
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(GROUPED_NUMBER, '[number]')
    .replace(LONG_NUMBER, '[number]');
}

const MAX_ERROR_CHARS = 300;

/** An error message that is safe to log: redacted and bounded. Errors from tools can echo customer input. */
export function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactText(message).replace(/\s+/g, ' ').trim();
  return redacted.length > MAX_ERROR_CHARS ? `${redacted.slice(0, MAX_ERROR_CHARS)}…` : redacted;
}

const refKey = () => env.ADMIN_SESSION_SECRET ?? 'fashion-tomodev-log-ref-local-key';

/** Stable pseudonym for a thread/visitor ID: log lines of one thread can be joined without logging the ID itself. */
export function ref(id: string) {
  return createHmac('sha256', refKey()).update(`log-ref:${id}`).digest('hex').slice(0, 16);
}

/**
 * Defence in depth for the pino logger: if a call site ever logs a whole object, these fields are censored anyway.
 * `*.x` covers one level of nesting (for example `{ input: { phone } }`).
 */
export const LOG_REDACT_PATHS = [
  'args', 'question', 'message', 'payload', 'body', 'headers', 'authorization',
  'phone', 'email', 'address', 'customer_name', 'customerName', 'shipping_address', 'shippingAddress', 'note',
  '*.args', '*.phone', '*.email', '*.address', '*.customer_name', '*.customerName', '*.shipping_address', '*.shippingAddress', '*.authorization',
];
