import { ChatOpenAI } from '@langchain/openai';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';
import { postgresApprovals } from '@/features/agent/approvals';
import { mcpGateway } from '@/features/agent/gateway';
import { compileAgentGraph, type AgentGraph, type AgentModel } from '@/features/agent/graph';
import { agentTools } from '@/features/agent/tools';
import { answerWithRag } from '@/features/chat/rag-answer';
import { env } from '@/lib/env';

export const LANGGRAPH_SCHEMA = 'langgraph';
export const MEMORY_TTL_MINUTES = 30 * 24 * 60;

/** Same model contract as Week 6, through LangChain's Responses API client. */
export const openAiAgentModel: AgentModel = {
  async invoke(messages, { signal, user, forceFinal }) {
    const model = new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_CHAT_MODEL,
      temperature: env.OPENAI_TEMPERATURE,
      maxTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: env.OPENAI_MAX_RETRIES,
      useResponsesApi: true,
      zdrEnabled: true, // sends store: false
      service_tier: 'default',
      user,
    });
    return model.bindTools(agentTools, { parallel_tool_calls: false, tool_choice: forceFinal ? 'final_answer' : 'required', strict: true }).invoke(messages, { signal });
  },
};

export function createCheckpointer() {
  return PostgresSaver.fromConnString(env.DATABASE_URL, { schema: LANGGRAPH_SCHEMA });
}

export function createStore(sweep = false) {
  return PostgresStore.fromConnString(env.DATABASE_URL, {
    schema: LANGGRAPH_SCHEMA,
    ttl: { defaultTtl: MEMORY_TTL_MINUTES, refreshOnRead: true, ...(sweep ? { sweepIntervalMinutes: 24 * 60 } : {}) },
  });
}

type Runtime = { graph: AgentGraph; checkpointer: PostgresSaver; store: PostgresStore };
const holder = globalThis as unknown as { fashionAgentRuntime?: Runtime };

/** One compiled graph per process; state lives in Postgres, so a new instance resumes the same threads. */
export function getAgentRuntime(): Runtime {
  if (!holder.fashionAgentRuntime) {
    const checkpointer = createCheckpointer();
    const store = createStore();
    const graph = compileAgentGraph({ model: openAiAgentModel, gateway: mcpGateway, approvals: postgresApprovals, answerWithRag, now: () => new Date() }, checkpointer, store);
    holder.fashionAgentRuntime = { graph, checkpointer, store };
  }
  return holder.fashionAgentRuntime;
}

/** Drops the in-process graph (used by evals to simulate a restart before resume). */
export async function resetAgentRuntime() {
  const runtime = holder.fashionAgentRuntime;
  holder.fashionAgentRuntime = undefined;
  if (runtime) await Promise.all([runtime.checkpointer.end(), runtime.store.stop()]);
}
