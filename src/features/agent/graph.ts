import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { Annotation, END, interrupt, messagesStateReducer, START, StateGraph, type BaseCheckpointSaver, type BaseStore, type LangGraphRunnableConfig } from '@langchain/langgraph';
import type { ModelMessage } from 'ai';
import type { ApprovalStore } from '@/features/agent/approvals';
import type { ConfirmationAction, ConfirmationStore } from '@/features/agent/confirmations';
import type { ToolGateway } from '@/features/agent/gateway';
import { chooseRoute, type Route } from '@/features/agent/router';
import { cancelDetails, cartFingerprint, checkoutDetails, orderFingerprint, type CheckoutPayload } from '@/features/agent/shop-types';
import { cancelOrderArgs, cartLineArgs, checkoutArgs, confirmTools, finalAnswerArgs, lookupOrderArgs, parseExchangeArgs, parseReturnArgs, readTools, searchProductsArgs, cartTools, writeTools } from '@/features/agent/tools';
import type { answerWithRag, FinalAnswer, SourceRef } from '@/features/chat/rag-answer';
import { enforceGroundedNumbers } from '@/features/chat/grounding';
import { injectionRefusal } from '@/features/chat/guardrails';
import { validateAnswer } from '@/features/chat/validation';
import { checkRequest, returnReasonStated } from '@/features/orders/policy';
import { checkoutInput, normalizePhone } from '@/features/orders/customer-schemas';
import type { RequestAction, RequestProposal } from '@/features/orders/types';
import type { PreviousSource } from '@/features/rag/query';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export type ApprovalInterrupt = {
  approvalId: string;
  action: RequestAction;
  payload: Record<string, string>;
  summary: string;
  sourceIds: string[];
  idempotencyKey: string;
};
export type ApprovalResume = { decision: 'approved' | 'rejected' | 'expired'; note?: string | null };

/** Interrupt payload when the customer must confirm checkout/cancel in the chat (buttons Xác nhận / Huỷ). */
export type ConfirmInterrupt = { kind: 'confirmation'; confirmationId: string; action: ConfirmationAction; summary: string; details: string[] };
export type ConfirmResume = { decision: 'confirmed' | 'cancelled' | 'expired' };

/** Work prepared by a node that must now wait for a decision; kept in state so the waiting node has no side effects when it re-runs on resume. */
type Awaiting =
  | { kind: 'approval'; toolCallId: string; proposal: RequestProposal; summary: string; sources: SourceRef[]; orderId: string | null; interrupt: ApprovalInterrupt }
  | { kind: 'confirmation'; toolCallId: string; toolName: string; interrupt: ConfirmInterrupt };

type PendingAction = { approvalId: string; toolCallId: string; proposal: RequestProposal; summary: string; note: string | null };
type LastRequest = { action: RequestAction; orderId: string; productId: string; requestedSize: string | null; requestId: string; createdAt: string };
type Profile = { preferredSize?: string; lastRequest?: LastRequest; updatedAt?: string };

const last = <T>() => Annotation<T>({ reducer: (_current: T, next: T) => next, default: () => undefined as T });

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  userId: Annotation<string>(),
  route: last<Route | null>(),
  orderId: Annotation<string | null>({ reducer: (current, next) => next ?? current, default: () => null }),
  pendingAction: last<PendingAction | null>(),
  approvalStatus: Annotation<'none' | 'pending' | 'approved' | 'rejected' | 'expired'>({ reducer: (_c, next) => next, default: () => 'none' }),
  awaiting: last<Awaiting | null>(),
  /** Orders the customer has proved they own in this thread (browser match or phone). Exchange/return needs it. */
  verifiedOrders: Annotation<string[]>({ reducer: (current, next) => [...new Set([...current, ...next])], default: () => [] }),
  /** True after an agent-routed turn, so short follow-ups ("size L", "COD") stay with the agent. */
  shopContext: Annotation<boolean>({ reducer: (_c, next) => next, default: () => false }),
  turnSources: Annotation<SourceRef[]>({ reducer: (_c, next) => next, default: () => [] }),
  lastSources: Annotation<PreviousSource[]>({ reducer: (_c, next) => next, default: () => [] }),
  lastRequest: last<LastRequest | null>(),
  modelCalls: Annotation<number>({ reducer: (_c, next) => next, default: () => 0 }),
  toolCalls: Annotation<number>({ reducer: (_c, next) => next, default: () => 0 }),
  finalAnswer: last<FinalAnswer | null>(),
});
export type AgentStateValue = typeof AgentState.State;

/** `forceFinal` restricts the model to final_answer on its last allowed step. */
export type AgentModel = { invoke(messages: BaseMessage[], options: { signal?: AbortSignal; user: string; forceFinal: boolean }): Promise<AIMessage> };

export type AgentDeps = {
  model: AgentModel;
  gateway: ToolGateway;
  approvals: ApprovalStore;
  confirmations: ConfirmationStore;
  answerWithRag: typeof answerWithRag;
  now: () => Date;
};

const agentPrompt = readFileSync(join(process.cwd(), 'prompts', 'fashion-tomodev-agent-system.md'), 'utf8').match(/```text\n([\s\S]*?)\n```/)![1];

const profileNamespace = (userId: string) => ['fashion-tomodev', userId, 'profile'];
const traceOf = (config: LangGraphRunnableConfig) => String(config.configurable?.trace_id ?? 'untraced');
const threadOf = (config: LangGraphRunnableConfig) => String(config.configurable?.thread_id);
const lastAi = (messages: BaseMessage[]) => messages.at(-1) as AIMessage;
/** Text of a message whether the provider returned a string or content blocks. */
const textOf = (message: BaseMessage) => typeof message.content === 'string'
  ? message.content
  : message.content.map((block) => block.type === 'text' && 'text' in block ? String(block.text) : '').join('').trim();
const mergeSources = (current: SourceRef[], added: SourceRef[]) => [...current, ...added.filter((source) => !current.some((item) => item.id === source.id))];
const toolMessage = (id: string, name: string, payload: unknown) => new ToolMessage({ tool_call_id: id, name, content: JSON.stringify(payload) });

/** Plain user/assistant turns, as the Week 6 RAG pipeline expects. */
function ragHistory(messages: BaseMessage[]): ModelMessage[] {
  const turns = messages.flatMap((message): ModelMessage[] => {
    if (HumanMessage.isInstance(message)) return [{ role: 'user', content: textOf(message) }];
    if (AIMessage.isInstance(message) && !message.tool_calls?.length && textOf(message)) return [{ role: 'assistant', content: textOf(message) }];
    return [];
  });
  return turns.slice(-(Math.min(env.MAX_HISTORY_MESSAGES, env.MAX_HISTORY_TURNS * 2) + 1));
}

/** Keeps whole recent turns so every tool call stays paired with its result. */
function agentHistory(messages: BaseMessage[]) {
  const humanIndexes = messages.flatMap((message, index) => HumanMessage.isInstance(message) ? [index] : []);
  const start = humanIndexes.at(-Math.max(1, env.MAX_HISTORY_TURNS)) ?? 0;
  return messages.slice(start);
}

function limitAnswer(reason: string): FinalAnswer {
  return {
    answer: 'Yêu cầu cần nhiều bước hơn mức cho phép nên mình tạm dừng để tránh xử lý sai. Bạn vui lòng thử lại với mã đơn và sản phẩm cụ thể, hoặc liên hệ nhân viên Fashion Tomodev để được hỗ trợ.',
    citedSourceIds: [],
    insufficientInformation: true,
    sources: [],
    diagnostics: { route: 'limit', validation: reason, promptSourceIds: [], modelCitations: null, inputTokens: 0, outputTokens: 0 },
  };
}

function parseProposal(name: string, args: unknown): RequestProposal {
  const selector = (parsed: { item_size?: string | null; item_color?: string | null }) => ({ itemSize: parsed.item_size?.trim() || undefined, itemColor: parsed.item_color?.trim() || undefined });
  if (name === 'create_exchange_request') {
    const parsed = parseExchangeArgs(args);
    return { action: 'exchange_size', orderId: parsed.order_id.trim().toUpperCase(), productId: parsed.product_id.trim().toUpperCase(), requestedSize: parsed.requested_size.trim(), ...selector(parsed) };
  }
  const parsed = parseReturnArgs(args);
  return { action: 'return', orderId: parsed.order_id.trim().toUpperCase(), productId: parsed.product_id.trim().toUpperCase(), reason: parsed.reason, ...selector(parsed) };
}

export function buildAgentGraph(deps: AgentDeps) {
  /** Logs one line per node with trace id, latency and step counters. */
  const node = <R>(name: string, run: (state: AgentStateValue, config: LangGraphRunnableConfig) => Promise<R>) =>
    async (state: AgentStateValue, config: LangGraphRunnableConfig) => {
      const startedAt = Date.now();
      try {
        const result = await run(state, config);
        logger.info({ trace_id: traceOf(config), stage: 'graph.node', node: name, latencyMs: Date.now() - startedAt, modelCalls: state.modelCalls, toolCalls: state.toolCalls });
        return result;
      } catch (error) {
        // interrupt() signals by throwing; only real failures are logged as errors.
        if (error instanceof Error && error.name === 'GraphInterrupt') {
          logger.info({ trace_id: traceOf(config), stage: 'graph.interrupt', node: name, latencyMs: Date.now() - startedAt });
        } else {
          logger.error({ trace_id: traceOf(config), stage: 'graph.node_failed', node: name, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
        }
        throw error;
      }
    };

  const router = node('router', async (state) => {
    const message = state.messages.findLast((item) => HumanMessage.isInstance(item));
    const route = chooseRoute(message ? textOf(message) : '', { orderId: state.orderId, shopping: state.shopContext });
    return { route, shopContext: route === 'agent' ? true : route === 'rag' ? false : state.shopContext };
  });

  const guard = node('guard', async (state, config) => {
    logger.warn({ trace_id: traceOf(config), stage: 'guardrail.prompt_injection' });
    const answer: FinalAnswer = { ...injectionRefusal, sources: [], diagnostics: { route: 'guard', validation: 'prompt_injection', promptSourceIds: [], modelCitations: null, inputTokens: 0, outputTokens: 0 } };
    return { finalAnswer: answer, messages: [new AIMessage(answer.answer)] };
  });

  const rag = node('rag', async (state, config) => {
    const message = textOf(state.messages.findLast((item) => HumanMessage.isInstance(item))!);
    const answer = await deps.answerWithRag({
      message,
      history: ragHistory(state.messages),
      previousSources: state.lastSources,
      visitorHash: state.userId,
      traceId: traceOf(config),
      signal: config.signal,
      onPartial: (partial) => config.writer?.({ type: 'partial', answer: partial }),
    });
    return { finalAnswer: answer, lastSources: answer.sources.map(({ id, title }) => ({ id, title })), messages: [new AIMessage(answer.answer)] };
  });

  const agent = node('agent', async (state, config) => {
    if (state.modelCalls >= env.AGENT_MAX_STEPS) return { finalAnswer: limitAnswer('max_steps'), messages: [new AIMessage(limitAnswer('max_steps').answer)] };
    config.writer?.({ type: 'status', status: 'Đang xử lý yêu cầu…' });
    const profile = (await config.store?.get(profileNamespace(state.userId), 'profile'))?.value as Profile | undefined;
    const profileText = profile?.preferredSize || profile?.lastRequest
      ? JSON.stringify({ size_thuong_chon: profile.preferredSize ?? null, yeu_cau_gan_nhat: profile.lastRequest ?? null })
      : 'Chưa có.';
    const system = agentPrompt
      .replace('{{today}}', deps.now().toISOString().slice(0, 10))
      .replace('{{customer_profile}}', profileText)
      .replace('{{allowed_source_ids}}', state.turnSources.length ? state.turnSources.map((source) => source.id).join(', ') : 'Chưa có (chưa gọi tool nào trong lượt này).');
    // The last allowed step must answer with what was gathered instead of hitting the limit.
    const forceFinal = state.modelCalls >= env.AGENT_MAX_STEPS - 1 || state.toolCalls >= env.AGENT_MAX_TOOL_CALLS;
    const response = await deps.model.invoke([new SystemMessage(system), ...agentHistory(state.messages)], { signal: config.signal, user: state.userId, forceFinal });
    return { messages: [response], modelCalls: state.modelCalls + 1 };
  });

  const customerText = (state: AgentStateValue) => state.messages.filter((message) => HumanMessage.isInstance(message)).slice(-4).map(textOf).join('\n');
  /** The model may only use a phone number the customer actually typed. */
  const phoneStated = (phone: string, text: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    const compact = text.replace(/[\s.\-()]/g, '');
    return [normalized, `+84${normalized.slice(1)}`, `84${normalized.slice(1)}`].some((form) => compact.includes(form));
  };
  const notAllowed = (code: string, message: string) => ({ status: 'not_allowed', code, message });
  const cartSource: SourceRef = { id: 'cart:current', title: 'Giỏ hàng', type: 'cart' };

  type ToolContext = { state: AgentStateValue; traceId: string; threadId: string };
  type ToolOutcome = { payload: unknown; sources?: SourceRef[]; orderId?: string; verified?: string };
  const toolStatus: Record<string, string> = {
    lookup_order: 'Đang tra đơn hàng…', search_policy: 'Đang tra chính sách…', lookup_product: 'Đang tra sản phẩm…', search_products: 'Đang tìm sản phẩm…',
    view_cart: 'Đang xem giỏ hàng…', add_to_cart: 'Đang thêm vào giỏ hàng…', set_cart_quantity: 'Đang cập nhật giỏ hàng…',
  };
  const toolHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolOutcome>> = {
    async lookup_order(rawArgs, { state, traceId, threadId }) {
      const args = lookupOrderArgs.partial({ phone: true }).parse(rawArgs);
      const id = args.order_id.trim().toUpperCase();
      const phone = args.phone?.trim() || null;
      if (phone && !phoneStated(phone, customerText(state))) {
        return { payload: notAllowed('phone_not_stated', 'Số điện thoại phải do khách cung cấp trong cuộc trò chuyện. Hãy hỏi khách số điện thoại đặt hàng.') };
      }
      const result = await deps.gateway.verifyOrder(threadId, id, phone, traceId);
      if (!result.verified) return { payload: { status: 'not_verified', order_id: id, message: result.message } };
      return { payload: { source_id: `order:${id}`, ...result.order }, sources: [{ id: `order:${id}`, title: `Đơn hàng ${id}`, type: 'order' }], orderId: result.order.id, verified: result.order.id };
    },
    async lookup_product(args, { traceId }) {
      const id = String(args.product_id).trim().toUpperCase();
      const product = await deps.gateway.lookupProduct(id, traceId);
      return product
        ? { payload: { source_id: `product:${id}`, ...product }, sources: [{ id: `product:${id}`, title: product.name, type: 'product' }] }
        : { payload: { found: false, message: `Không có sản phẩm ${id} trong catalog.` } };
    },
    async search_policy(args, { traceId }) {
      const hits = await deps.gateway.searchPolicy(String(args.query), traceId);
      return { payload: hits.length ? hits : { found: false, message: 'Không tìm thấy chính sách phù hợp.' }, sources: hits.map((hit) => ({ id: hit.source_id, title: hit.title, type: 'policy' })) };
    },
    async search_products(rawArgs, { traceId }) {
      const args = searchProductsArgs.partial({ max_price_vnd: true }).parse(rawArgs);
      const hits = await deps.gateway.searchProducts(args.query, args.max_price_vnd ?? null, traceId);
      return { payload: hits.length ? hits : { found: false, message: 'Không tìm thấy sản phẩm phù hợp.' }, sources: hits.map((hit) => ({ id: hit.source_id, title: hit.name, type: 'product' })) };
    },
    async view_cart(_args, { threadId, traceId }) {
      return { payload: await deps.gateway.viewCart(threadId, traceId), sources: [cartSource] };
    },
    async add_to_cart(rawArgs, { threadId, traceId }) {
      const args = cartLineArgs.partial({ color: true }).parse(rawArgs);
      const cart = await deps.gateway.addToCart(threadId, { productId: args.product_id, size: args.size, color: args.color ?? null, quantity: args.quantity }, traceId);
      return { payload: { status: 'added', ...cart }, sources: [cartSource, { id: `product:${args.product_id.trim().toUpperCase()}`, title: args.product_id.trim().toUpperCase(), type: 'product' }] };
    },
    async set_cart_quantity(rawArgs, { threadId, traceId }) {
      const args = cartLineArgs.partial({ color: true }).parse(rawArgs);
      const cart = await deps.gateway.setCartQuantity(threadId, { productId: args.product_id, size: args.size, color: args.color ?? null, quantity: args.quantity }, traceId);
      return { payload: { status: 'updated', ...cart }, sources: [cartSource] };
    },
  };

  const tools = node('tools', async (state, config) => {
    const calls = lastAi(state.messages).tool_calls ?? [];
    const context: ToolContext = { state, traceId: traceOf(config), threadId: threadOf(config) };
    const messages: ToolMessage[] = [];
    let sources = state.turnSources;
    let orderId: string | null = null;
    const verified: string[] = [];
    for (const call of calls) {
      config.writer?.({ type: 'status', status: toolStatus[call.name] ?? 'Đang xử lý…' });
      try {
        const handler = readTools.has(call.name) || cartTools.has(call.name) ? toolHandlers[call.name] : undefined;
        if (!handler) throw new Error('Mỗi lần chỉ được gọi một tool; hãy gọi lại riêng tool này.');
        const outcome = await handler(call.args as Record<string, unknown>, context);
        if (outcome.sources) sources = mergeSources(sources, outcome.sources);
        if (outcome.orderId) orderId = outcome.orderId;
        if (outcome.verified) verified.push(outcome.verified);
        messages.push(toolMessage(call.id!, call.name, outcome.payload));
      } catch (error) {
        messages.push(toolMessage(call.id!, call.name, { status: 'error', message: error instanceof Error ? error.message : String(error) }));
      }
    }
    return { messages, toolCalls: state.toolCalls + calls.length, turnSources: sources, orderId, verifiedOrders: verified };
  });

  // ───────── Staff approval for exchange/return: prepare (checks + record) → wait (interrupt) → execute ─────────
  const approve = node('approve', async (state, config) => {
    const call = lastAi(state.messages).tool_calls![0];
    const traceId = traceOf(config);
    let proposal: RequestProposal;
    try { proposal = parseProposal(call.name, call.args); }
    catch { return { messages: [toolMessage(call.id!, call.name, { status: 'not_allowed', code: 'invalid_arguments', message: 'Thiếu hoặc sai mã đơn, mã sản phẩm, size hoặc lý do.' })], toolCalls: state.toolCalls + 1 }; }

    if (state.approvalStatus === 'rejected' || state.approvalStatus === 'expired') {
      return { messages: [toolMessage(call.id!, call.name, { status: 'not_allowed', code: 'just_decided', message: `Yêu cầu vừa ${state.approvalStatus === 'rejected' ? 'bị nhân viên từ chối' : 'hết hạn chờ duyệt'}; không đề xuất lại trong lượt này. Hãy báo kết quả cho khách bằng final_answer.` })], toolCalls: state.toolCalls + 1 };
    }
    if (!state.verifiedOrders.includes(proposal.orderId)) {
      return { messages: [toolMessage(call.id!, call.name, notAllowed('not_verified', `Chưa xác minh khách sở hữu đơn ${proposal.orderId}. Hỏi số điện thoại đặt hàng rồi gọi lookup_order kèm phone trước khi đề xuất đổi/trả.`))], toolCalls: state.toolCalls + 1 };
    }
    if (proposal.action === 'return') {
      if (!returnReasonStated(proposal.reason, customerText(state))) {
        return { messages: [toolMessage(call.id!, call.name, { status: 'not_allowed', code: 'reason_not_stated', message: 'Khách chưa nêu lý do trả hàng thuộc trường hợp được hỗ trợ (nhận sai sản phẩm, sai size/màu so với đơn, lỗi sản xuất). Không tự chọn lý do: giải thích chính sách hoặc hỏi lại khách.' })], toolCalls: state.toolCalls + 1 };
      }
    }
    const [order, product] = await Promise.all([deps.gateway.lookupOrder(proposal.orderId, traceId), deps.gateway.lookupProduct(proposal.productId, traceId)]);
    const sources = mergeSources(state.turnSources, [
      { id: `order:${proposal.orderId}`, title: `Đơn hàng ${proposal.orderId}`, type: 'order' },
      ...(product ? [{ id: `product:${proposal.productId}`, title: product.name, type: 'product' }] : []),
    ]);
    const check = checkRequest(proposal, order, product, deps.now());
    const base = { toolCalls: state.toolCalls + 1, turnSources: sources, orderId: order?.id ?? null };
    if (!check.ok) return { ...base, messages: [toolMessage(call.id!, call.name, { status: 'not_allowed', code: check.code, message: check.message })] };
    if (check.existingRequestId) {
      sources.push({ id: `request:${check.existingRequestId}`, title: 'Yêu cầu đổi/trả đã có', type: 'request' });
      return { ...base, messages: [toolMessage(call.id!, call.name, { status: 'already_created', request_id: check.existingRequestId, source_id: `request:${check.existingRequestId}`, message: 'Yêu cầu giống hệt đã được tạo trước đó; không tạo bản ghi mới.' })] };
    }

    // From here on the proposal is canonical (the order line is named when the order holds the product several times).
    const payload = Object.fromEntries(Object.entries(check.proposal).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const approval = await deps.approvals.ensure({ threadId: threadOf(config), action: check.proposal.action, payload, summary: check.summary, sourceIds: sources.map((source) => source.id), idempotencyKey: check.idempotencyKey });
    if (approval.threadId !== threadOf(config)) {
      return { ...base, messages: [toolMessage(call.id!, call.name, { status: 'not_allowed', code: 'pending_elsewhere', message: 'Yêu cầu giống hệt đang chờ duyệt trong một cuộc trò chuyện khác.' })] };
    }
    return {
      ...base,
      awaiting: { kind: 'approval' as const, toolCallId: call.id!, proposal: check.proposal, summary: check.summary, sources, orderId: order?.id ?? null, interrupt: { approvalId: approval.id, action: check.proposal.action, payload, summary: check.summary, sourceIds: sources.map((source) => source.id), idempotencyKey: check.idempotencyKey } },
    };
  });

  // Pure wait: no database writes before interrupt(), because the node re-runs from the top when the graph resumes.
  const approveWait = node('approve_wait', async (state) => {
    const waiting = state.awaiting;
    if (waiting?.kind !== 'approval') return { awaiting: null };
    const decision = interrupt<ApprovalInterrupt, ApprovalResume>(waiting.interrupt);
    const reset = { awaiting: null, turnSources: waiting.sources, orderId: waiting.orderId, modelCalls: 0, toolCalls: 0 };
    if (decision.decision === 'approved') {
      return { ...reset, approvalStatus: 'approved' as const, pendingAction: { approvalId: waiting.interrupt.approvalId, toolCallId: waiting.toolCallId, proposal: waiting.proposal, summary: waiting.summary, note: decision.note ?? null } };
    }
    const name = waiting.proposal.action === 'exchange_size' ? 'create_exchange_request' : 'create_return_request';
    return {
      ...reset,
      approvalStatus: decision.decision,
      pendingAction: null,
      messages: [toolMessage(waiting.toolCallId, name, {
        status: decision.decision,
        note: decision.note ?? null,
        message: decision.decision === 'rejected'
          ? 'Nhân viên đã từ chối yêu cầu.'
          : 'Yêu cầu bị hủy tự động vì quá 7 ngày không có nhân viên duyệt. Đây KHÔNG phải do đơn quá hạn đổi/trả; khách có thể gửi lại yêu cầu nếu đơn vẫn còn trong thời hạn.',
      })],
    };
  });

  // ───────── Customer confirmation for checkout / cancel: prepare → wait (interrupt) → perform ─────────
  const confirm = node('confirm', async (state, config) => {
    const call = lastAi(state.messages).tool_calls![0];
    const traceId = traceOf(config);
    const threadId = threadOf(config);
    const deny = (code: string, message: string, extra: Partial<AgentStateValue> = {}) => ({ ...extra, messages: [toolMessage(call.id!, call.name, notAllowed(code, message))], toolCalls: state.toolCalls + 1 });
    if (state.approvalStatus === 'rejected' || state.approvalStatus === 'expired') return deny('just_decided', 'Yêu cầu của khách vừa được xử lý; không đề xuất thao tác mới trong lượt này. Hãy báo kết quả cho khách bằng final_answer.');
    const asked = (action: ConfirmationAction, id: string, summary: string, details: string[], sources: SourceRef[]) => ({
      toolCalls: state.toolCalls + 1,
      turnSources: sources,
      awaiting: { kind: 'confirmation' as const, toolCallId: call.id!, toolName: call.name, interrupt: { kind: 'confirmation' as const, confirmationId: id, action, summary, details } },
    });

    if (call.name === 'checkout') {
      const parsed = checkoutArgs.partial({ note: true }).safeParse(call.args);
      if (!parsed.success) return deny('invalid_arguments', 'Thiếu thông tin giao hàng: cần họ tên, số điện thoại, địa chỉ và hình thức thanh toán do khách cung cấp.');
      const form = checkoutInput.omit({ idempotencyKey: true }).safeParse({ name: parsed.data.name, phone: parsed.data.phone, address: parsed.data.address, note: parsed.data.note ?? '', paymentMethod: parsed.data.payment_method });
      if (!form.success) return deny('invalid_arguments', form.error.issues[0]?.message ?? 'Thông tin giao hàng chưa hợp lệ.');
      if (!phoneStated(form.data.phone, customerText(state))) return deny('phone_not_stated', 'Số điện thoại nhận hàng phải do khách cung cấp trong cuộc trò chuyện. Hãy hỏi khách.');
      const cart = await deps.gateway.viewCart(threadId, traceId);
      const sources = mergeSources(state.turnSources, [cartSource]);
      if (!cart.lines.length) return deny('cart_empty', 'Giỏ hàng đang trống; hãy giúp khách thêm sản phẩm trước.', { turnSources: sources });
      const problems = cart.lines.filter((line) => line.issue);
      if (problems.length) return deny('cart_has_issues', `Giỏ hàng có sản phẩm không đặt được: ${problems.map((line) => `${line.name} (${line.size} / ${line.color}): ${line.issue}`).join('; ')}. Hãy báo khách và điều chỉnh giỏ.`, { turnSources: sources });
      const payload: CheckoutPayload = { name: form.data.name, phone: form.data.phone, address: form.data.address, note: form.data.note, paymentMethod: form.data.paymentMethod };
      const details = checkoutDetails(cart, payload);
      const summary = `Đặt hàng ${cart.item_count} sản phẩm, tổng ${details.find((line) => line.startsWith('Tổng thanh toán'))?.split(': ')[1] ?? ''}`;
      const created = await deps.confirmations.create({ threadId, action: 'checkout', payload, summary, details, fingerprint: cartFingerprint(cart) });
      return asked('checkout', created.id, summary, details, sources);
    }

    const parsed = cancelOrderArgs.partial({ phone: true }).safeParse(call.args);
    if (!parsed.success) return deny('invalid_arguments', 'Thiếu mã đơn cần hủy.');
    const id = parsed.data.order_id.trim().toUpperCase();
    const phone = parsed.data.phone?.trim() || null;
    if (phone && !phoneStated(phone, customerText(state))) return deny('phone_not_stated', 'Số điện thoại phải do khách cung cấp trong cuộc trò chuyện. Hãy hỏi khách số điện thoại đặt hàng.');
    const verification = await deps.gateway.verifyOrder(threadId, id, phone, traceId);
    if (!verification.verified) return deny('not_verified', verification.message);
    const order = verification.order;
    const sources = mergeSources(state.turnSources, [{ id: `order:${id}`, title: `Đơn hàng ${id}`, type: 'order' }]);
    const base = { orderId: order.id, verifiedOrders: [order.id] };
    if (!order.canCancel) {
      return deny('not_cancellable', order.status === 'cancelled' ? `Đơn ${id} đã được hủy trước đó.` : order.status !== 'processing' ? `Đơn ${id} đang ở trạng thái ${order.status} nên không hủy được.` : `Đơn ${id} đã thanh toán nên không tự hủy được; khách cần liên hệ cửa hàng để được hoàn tiền.`, { ...base, turnSources: sources });
    }
    const details = cancelDetails(order);
    const summary = `Hủy đơn ${id}`;
    const created = await deps.confirmations.create({ threadId, action: 'cancel_order', payload: { orderCode: id, phone }, summary, details, fingerprint: orderFingerprint({ id: order.id, status: order.status, paymentStatus: order.paymentStatus }) });
    return { ...base, ...asked('cancel_order', created.id, summary, details, sources) };
  });

  const confirmWait = node('confirm_wait', async (state) => {
    const waiting = state.awaiting;
    if (waiting?.kind !== 'confirmation') return { awaiting: null };
    const answer = interrupt<ConfirmInterrupt, ConfirmResume>(waiting.interrupt);
    if (answer.decision === 'confirmed') return { modelCalls: 0, toolCalls: 0 };
    return {
      awaiting: null, modelCalls: 0, toolCalls: 0,
      messages: [toolMessage(waiting.toolCallId, waiting.toolName, {
        status: answer.decision,
        message: answer.decision === 'cancelled' ? 'Khách đã bấm Huỷ: thao tác KHÔNG được thực hiện. Giỏ hàng/đơn giữ nguyên.' : 'Khách không xác nhận trong thời gian cho phép nên thao tác KHÔNG được thực hiện. Mời khách yêu cầu lại nếu vẫn muốn.',
      })],
    };
  });

  const perform = node('perform', async (state, config) => {
    const waiting = state.awaiting;
    if (waiting?.kind !== 'confirmation') return { awaiting: null };
    const { confirmationId, action } = waiting.interrupt;
    config.writer?.({ type: 'status', status: action === 'checkout' ? 'Đang tạo đơn hàng…' : 'Đang hủy đơn…' });
    try {
      const traceId = traceOf(config);
      const done = action === 'checkout' ? await deps.gateway.checkout(threadOf(config), confirmationId, traceId) : await deps.gateway.cancelOrder(threadOf(config), confirmationId, traceId);
      return {
        awaiting: null, toolCalls: state.toolCalls + 1,
        messages: [toolMessage(waiting.toolCallId, waiting.toolName, { ...done, message: action === 'checkout' ? 'Khách đã xác nhận và đơn hàng đã được tạo thành công.' : 'Khách đã xác nhận và đơn đã được hủy.' })],
        turnSources: mergeSources(state.turnSources, [{ id: done.source_id, title: `Đơn hàng ${done.order_code}`, type: 'order' }]),
        orderId: done.order_code,
        verifiedOrders: [done.order_code],
      };
    } catch (error) {
      return { awaiting: null, toolCalls: state.toolCalls + 1, messages: [toolMessage(waiting.toolCallId, waiting.toolName, { status: 'error', message: error instanceof Error ? error.message : String(error) })] };
    }
  });

  const execute = node('execute', async (state, config) => {
    const pending = state.pendingAction!;
    const name = pending.proposal.action === 'exchange_size' ? 'create_exchange_request' : 'create_return_request';
    config.writer?.({ type: 'status', status: 'Đang tạo yêu cầu đã được duyệt…' });
    try {
      const created = await deps.gateway.createRequest(pending.proposal, pending.approvalId, traceOf(config));
      const proposal = pending.proposal;
      return {
        messages: [toolMessage(pending.toolCallId, name, {
          status: 'created',
          message: 'Nhân viên đã DUYỆT và yêu cầu đã được tạo thành công. Không còn bước chờ duyệt nào.',
          staff_note: pending.note,
          request_id: created.requestId,
          source_id: `request:${created.requestId}`,
          newly_created: created.created,
          summary: pending.summary,
        })],
        turnSources: mergeSources(state.turnSources, [{ id: `request:${created.requestId}`, title: pending.summary, type: 'request' }]),
        lastRequest: { action: proposal.action, orderId: proposal.orderId, productId: proposal.productId, requestedSize: proposal.action === 'exchange_size' ? proposal.requestedSize : null, requestId: created.requestId, createdAt: created.createdAt ?? deps.now().toISOString() },
        pendingAction: null,
        toolCalls: state.toolCalls + 1,
      };
    } catch (error) {
      return { messages: [toolMessage(pending.toolCallId, name, { status: 'error', message: error instanceof Error ? error.message : String(error) })], pendingAction: null, toolCalls: state.toolCalls + 1 };
    }
  });

  const respond = node('respond', async (state) => {
    const message = lastAi(state.messages);
    const call = message.tool_calls?.find((item) => item.name === 'final_answer');
    const parsed = call ? finalAnswerArgs.safeParse(call.args) : undefined;
    const raw = parsed?.success
      ? { answer: parsed.data.answer, citedSourceIds: parsed.data.cited_source_ids, insufficientInformation: parsed.data.insufficient_information }
      : { answer: textOf(message) || 'Mình chưa xử lý được yêu cầu này.', citedSourceIds: [], insufficientInformation: true };
    const allowed = new Set(state.turnSources.map((source) => source.id));
    const cited = validateAnswer(raw, allowed);
    // Numbers must appear in this turn's tool results, the customer's words or today's date.
    const turnStart = state.messages.findLastIndex((item) => HumanMessage.isInstance(item));
    const evidence = [
      ...state.messages.slice(turnStart).filter((item) => ToolMessage.isInstance(item)).map(textOf),
      ...state.messages.filter((item) => HumanMessage.isInstance(item)).slice(-3).map(textOf),
      deps.now().toISOString().slice(0, 10),
    ];
    const grounded = enforceGroundedNumbers(cited.answer, evidence);
    const validation = grounded.unsupported.length ? { answer: grounded.answer, outcome: 'unsupported_number' } : cited;
    const sources = state.turnSources.filter((source) => validation.answer.citedSourceIds.includes(source.id));
    const usage = state.messages.slice(turnStart + 1).reduce((sum, item) => {
      const metadata = AIMessage.isInstance(item) ? item.usage_metadata : undefined;
      return { input: sum.input + (metadata?.input_tokens ?? 0), output: sum.output + (metadata?.output_tokens ?? 0) };
    }, { input: 0, output: 0 });
    const answer: FinalAnswer = {
      ...validation.answer,
      sources,
      diagnostics: { route: 'agent', validation: validation.outcome, promptSourceIds: [...allowed], modelCitations: raw.citedSourceIds, unsupportedNumbers: grounded.unsupported, inputTokens: usage.input, outputTokens: usage.output },
    };
    // Every other tool call already has a result; final_answer gets an acknowledgement so history stays valid.
    const acknowledgements = (message.tool_calls ?? []).map((item) => toolMessage(item.id!, item.name, item.name === 'final_answer' ? { status: 'delivered' } : { status: 'skipped' }));
    return { finalAnswer: answer, lastSources: sources.map(({ id, title }) => ({ id, title })), messages: [...acknowledgements, new AIMessage(answer.answer)] };
  });

  const limit = node('limit', async (state) => {
    const answer = limitAnswer('max_tool_calls');
    const pending = (lastAi(state.messages).tool_calls ?? []).map((item) => toolMessage(item.id!, item.name, { status: 'skipped', message: 'Vượt giới hạn tool call.' }));
    return { finalAnswer: answer, messages: [...pending, new AIMessage(answer.answer)] };
  });

  const remember = node('remember', async (state, config) => {
    if (!state.lastRequest || !config.store) return {};
    const namespace = profileNamespace(state.userId);
    const current = ((await config.store.get(namespace, 'profile'))?.value ?? {}) as Profile;
    const profile: Profile = {
      preferredSize: state.lastRequest.requestedSize ?? current.preferredSize,
      lastRequest: state.lastRequest,
      updatedAt: deps.now().toISOString(),
    };
    await config.store.put(namespace, 'profile', profile);
    return { lastRequest: null };
  });

  return new StateGraph(AgentState)
    .addNode('router', router)
    .addNode('guard', guard)
    .addNode('rag', rag)
    .addNode('agent', agent)
    .addNode('tools', tools)
    .addNode('approve', approve)
    .addNode('approve_wait', approveWait)
    .addNode('confirm', confirm)
    .addNode('confirm_wait', confirmWait)
    .addNode('perform', perform)
    .addNode('execute', execute)
    .addNode('respond', respond)
    .addNode('limit', limit)
    .addNode('remember', remember)
    .addEdge(START, 'router')
    .addConditionalEdges('router', (state) => state.route ?? 'rag', ['guard', 'agent', 'rag'])
    .addEdge('guard', END)
    .addEdge('rag', END)
    .addConditionalEdges('agent', (state) => {
      if (state.finalAnswer) return END;
      const calls = lastAi(state.messages).tool_calls ?? [];
      if (!calls.length || calls.some((call) => call.name === 'final_answer')) return 'respond';
      if (calls.length === 1 && writeTools.has(calls[0].name)) return 'approve';
      if (calls.length === 1 && confirmTools.has(calls[0].name)) return 'confirm';
      if (state.toolCalls + calls.length > env.AGENT_MAX_TOOL_CALLS) return 'limit';
      return 'tools';
    }, ['respond', 'approve', 'confirm', 'tools', 'limit', END])
    .addEdge('tools', 'agent')
    .addConditionalEdges('approve', (state) => state.awaiting?.kind === 'approval' ? 'approve_wait' : 'agent', ['approve_wait', 'agent'])
    .addConditionalEdges('approve_wait', (state) => state.approvalStatus === 'approved' && state.pendingAction ? 'execute' : 'agent', ['execute', 'agent'])
    .addConditionalEdges('confirm', (state) => state.awaiting?.kind === 'confirmation' ? 'confirm_wait' : 'agent', ['confirm_wait', 'agent'])
    .addConditionalEdges('confirm_wait', (state) => state.awaiting?.kind === 'confirmation' ? 'perform' : 'agent', ['perform', 'agent'])
    .addEdge('perform', 'agent')
    .addEdge('execute', 'agent')
    .addEdge('respond', 'remember')
    .addEdge('remember', END)
    .addEdge('limit', END);
}

export function compileAgentGraph(deps: AgentDeps, checkpointer: BaseCheckpointSaver, store: BaseStore) {
  return buildAgentGraph(deps).compile({ checkpointer, store });
}
export type AgentGraph = ReturnType<typeof compileAgentGraph>;
