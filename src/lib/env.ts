import { z } from 'zod';

/**
 * A boolean env variable. `z.coerce.boolean()` turns the string "false" into `true` (any non-empty string is truthy),
 * so FOO=false silently left features on. Unset or empty uses the fallback; anything unrecognised fails at startup.
 */
export const envFlag = (fallback: boolean) => z.string().optional().transform((value, context) => {
  const text = value?.trim().toLowerCase();
  if (!text) return fallback;
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  context.addIssue({ code: z.ZodIssueCode.custom, message: `expected true or false, got "${value}"` });
  return z.NEVER;
});

const schema = z.object({
  // A local fallback lets `next build` load route modules without credentials.
  // Docker/local runtime should still set DATABASE_URL explicitly through .env.
  DATABASE_URL: z.string().min(1).default('postgres://fashion:fashion@localhost:5432/fashion'),
  // Fallback only: the key saved in Admin → Cài đặt takes precedence (see features/settings/openai-key.ts).
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-2025-04-14'),
  // Extra chat models an agent may be set to (comma-separated). OPENAI_CHAT_MODEL is always allowed.
  OPENAI_ALLOWED_MODELS: z.string().default(''),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(500),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().max(20).default(8),
  RETRIEVAL_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(0.45),
  MAX_CONTEXT_CHUNKS: z.coerce.number().int().positive().max(10).default(5),
  MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(1200),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(50),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  EMBEDDING_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  KNOWLEDGE_SAFETY_REVIEW_ENABLED: envFlag(true),
  RAG_POLICY_LIFECYCLE_ENABLED: envFlag(true),
  RAG_METRICS_ENABLED: envFlag(true),
  RAG_RERANK_ENABLED: envFlag(false),
  RAG_QUERY_REWRITE_ENABLED: envFlag(false),
  MAX_HISTORY_TURNS: z.coerce.number().int().min(0).default(10),
  MAX_HISTORY_MESSAGES: z.coerce.number().int().min(0).default(20),
  MAX_USER_MESSAGE_CHARS: z.coerce.number().int().positive().default(2000),
  PRODUCT_IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(2_097_152),
  // Shipping policy shown on the storefront; must match the FAQ (free from 799.000đ, otherwise 30.000đ).
  SHIPPING_FEE_VND: z.coerce.number().int().min(0).default(30_000),
  FREE_SHIPPING_FROM_VND: z.coerce.number().int().min(0).default(799_000),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  CHAT_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  UPLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  UPLOAD_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  MCP_URL: z.string().url().default('http://mcp:3001/mcp'),
  // Shared only between the web/worker services and the built-in MCP service.
  // It is deliberately optional at module-load time so static builds can load route modules;
  // both MCP server and gateway fail closed when they actually run without it.
  INTERNAL_MCP_TOKEN: z.string().min(24).optional(),
  // Rotation only: the previous token, still accepted by the MCP server until every client has restarted.
  INTERNAL_MCP_TOKEN_PREVIOUS: z.string().min(24).optional().or(z.literal('').transform(() => undefined)),
  // Comma-separated host or host:port entries that MCP server URLs may point at even when they resolve to a private address.
  // The host of MCP_URL (the built-in server) is always allowed.
  MCP_ALLOWED_HOSTS: z.string().default(''),
  MCP_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  MCP_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  MCP_PORT: z.coerce.number().int().positive().default(3001),
  // `memory` is useful for isolated unit tests. Compose sets `postgres`, which is required
  // when more than one web/worker process can receive requests.
  RATE_LIMIT_BACKEND: z.enum(['memory', 'postgres']).default('memory'),
  // HMAC key for rate-limit bucket names; defaults to ADMIN_SESSION_SECRET. Required (one of them) with `postgres`.
  RATE_LIMIT_SECRET: z.string().min(24).optional().or(z.literal('').transform(() => undefined)),
  // Generous per-IP cap on authenticated admin API calls (a stolen session or a runaway script), per minute.
  ADMIN_API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  // Debug only: also log a redacted copy of each chat message.
  LOG_CHAT_TEXT: envFlag(false),
  // Simulated online payment (the customer picks success/failure). Off by default: anyone owning an order could
  // mark it paid. When off, checkout (web and agent) only accepts COD until a real gateway is integrated.
  PAYMENT_SIMULATION_ENABLED: envFlag(false),
  // Worker alert checks (Admin → Monitoring + optional webhook). Rates are 0..1; checks need ALERT_MIN_SAMPLES calls in the window.
  ALERT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  ALERT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  ALERT_MIN_SAMPLES: z.coerce.number().int().positive().default(10),
  ALERT_DEPENDENCY_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  ALERT_CHAT_P95_MS: z.coerce.number().int().positive().default(15_000),
  ALERT_APPROVAL_MAX_AGE_MINUTES: z.coerce.number().int().positive().default(240),
  ALERT_DEDUPE_MINUTES: z.coerce.number().int().positive().default(60),
  // Slack/Discord-compatible incoming webhook; the payload carries numbers only. Empty = alerts stay in Admin and logs.
  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  // Bearer token for GET /api/metrics (Prometheus). Unset = the endpoint answers 404.
  METRICS_TOKEN: z.string().min(24).optional().or(z.literal('').transform(() => undefined)),
  // Optional link shown in Admin → Monitoring (Compose profile `observability` serves Grafana on 127.0.0.1:3002).
  GRAFANA_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  // Circuit breakers (OpenAI chat/embedding, built-in and external MCP). `observe` tracks and reports state without
  // blocking calls (rollout step); `enforce` stops calling a failing dependency for CIRCUIT_OPEN_SECONDS.
  CIRCUIT_BREAKER_MODE: z.enum(['off', 'observe', 'enforce']).default('observe'),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
  CIRCUIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(30),
  CIRCUIT_OPEN_SECONDS: z.coerce.number().int().positive().default(30),
  AGENT_SUMMARY_ENABLED: envFlag(true),
  AGENT_SUMMARIZE_AFTER_MESSAGES: z.coerce.number().int().min(4).default(24),
  AGENT_KEEP_RECENT_MESSAGES: z.coerce.number().int().min(4).default(16),
  AGENT_MAX_STEPS: z.coerce.number().int().positive().max(20).default(5),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().max(20).default(5),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().min(24).optional(),
  // Encrypts secrets stored in the database; defaults to ADMIN_SESSION_SECRET.
  SETTINGS_ENCRYPTION_KEY: z.string().min(16).optional(),
});

export const env = schema.parse(process.env);
