import { z } from 'zod';

const schema = z.object({
  // A local fallback lets `next build` load route modules without credentials.
  // Docker/local runtime should still set DATABASE_URL explicitly through .env.
  DATABASE_URL: z.string().min(1).default('postgres://fashion:fashion@localhost:5432/fashion'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-2025-04-14'),
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
  MAX_HISTORY_TURNS: z.coerce.number().int().min(0).default(10),
  MAX_HISTORY_MESSAGES: z.coerce.number().int().min(0).default(20),
  MAX_USER_MESSAGE_CHARS: z.coerce.number().int().positive().default(2000),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  CHAT_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  UPLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  UPLOAD_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  MCP_URL: z.string().url().default('http://mcp:3001/mcp'),
  MCP_PORT: z.coerce.number().int().positive().default(3001),
  AGENT_MAX_STEPS: z.coerce.number().int().positive().max(20).default(5),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().max(20).default(5),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().min(24).optional(),
});

export const env = schema.parse(process.env);
