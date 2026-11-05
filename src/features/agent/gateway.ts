import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { callExternalTool, type ExternalResult } from '@/features/mcp/external';
import type { AgentCart, AgentProductHit } from '@/features/agent/shop-types';
import type { Order, Product, RequestProposal } from '@/features/orders/types';
import { env } from '@/lib/env';
import { breakerFor, withRetry } from '@/lib/resilience';
import { ToolReportedError, trackDependency } from '@/lib/telemetry';
import { internalMcpToken } from '@/mcp/internal-auth';

export type KnowledgeHit = { source_id: string; title: string; content: string; similarity: number; updated_at: string };
export type CreatedRequest = { requestId: string; status: string; created: boolean; createdAt: string | null };
export type CartLineArgs = { productId: string; size: string; color: string | null; quantity: number };
export type OrderVerification = { verified: true; order: Order } | { verified: false; message: string };
/** Result of an executed customer-confirmed write, as returned by MCP (order code, totals, next step…). */
export type ConfirmedResult = { status: string; source_id: string; order_code: string } & Record<string, unknown>;

/** Everything the graph may do outside itself. Read tools are free; writes need an approved approval id. */
export type ToolGateway = {
  lookupProduct(productId: string, traceId: string): Promise<Product | null>;
  lookupOrder(orderId: string, traceId: string): Promise<Order | null>;
  /** Searches one knowledge scope (by its tool name); MCP checks the scope is enabled for the thread's agent. */
  searchKnowledge(threadId: string, scope: string, query: string, traceId: string): Promise<KnowledgeHit[]>;
  createRequest(proposal: RequestProposal, approvalRequestId: string, traceId: string): Promise<CreatedRequest>;
  // Shopping. `threadId` is supplied by the graph (never by the model) and binds each call to one visitor.
  searchProducts(query: string, maxPriceVnd: number | null, traceId: string): Promise<AgentProductHit[]>;
  verifyOrder(threadId: string, orderId: string, phone: string | null, traceId: string): Promise<OrderVerification>;
  viewCart(threadId: string, traceId: string): Promise<AgentCart>;
  addToCart(threadId: string, line: CartLineArgs, traceId: string): Promise<AgentCart>;
  setCartQuantity(threadId: string, line: CartLineArgs, traceId: string): Promise<AgentCart>;
  /** Calls a tool of an external MCP server (arguments are validated against its published schema). No thread or customer identity is sent. */
  callExternal(serverId: string, toolName: string, args: Record<string, unknown>, inputSchema: unknown, traceId: string): Promise<ExternalResult>;
  /** Run only what the customer confirmed (`confirmationId`); throws if they have not. */
  checkout(threadId: string, confirmationId: string, traceId: string): Promise<ConfirmedResult>;
  cancelOrder(threadId: string, confirmationId: string, traceId: string): Promise<ConfirmedResult>;
};

/**
 * Read tools that are safe to call twice. `verify_order` is excluded: a wrong phone counts towards the lookup limit, so
 * a retry after a timeout could count one attempt twice. Writes (cart, checkout, cancel, requests) are never retried.
 */
const retryableTools = new Set(['lookup_product', 'lookup_order', 'search_products', 'search_knowledge', 'view_cart']);

/**
 * Every built-in tool call goes through the `mcp:builtin` breaker, is timed and classified (ok / tool_error / failed /
 * timeout) for Monitoring, and read tools get one retry with jitter on an outage.
 */
export function guardedToolCall<T>(name: string, traceId: string, run: () => Promise<T>): Promise<T> {
  return breakerFor('mcp:builtin').run(() => {
    const once = () => trackDependency('mcp_builtin', name, traceId, run);
    return retryableTools.has(name) ? withRetry(once, { attempts: 2, baseMs: 200, maxMs: 1_000 }) : once();
  });
}

const callTool = <T>(name: string, args: Record<string, unknown>, traceId: string) => guardedToolCall(name, traceId, () => callBuiltinTool<T>(name, args, traceId));

async function callBuiltinTool<T>(name: string, args: Record<string, unknown>, traceId: string): Promise<T> {
  const mcpToken = internalMcpToken();
  if (!mcpToken) throw new Error('INTERNAL_MCP_TOKEN or ADMIN_SESSION_SECRET is required to call the built-in MCP server.');
  const client = new Client({ name: 'fashion-tomodev-agent', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(env.MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${mcpToken}` } },
  }));
  try {
    const result = await client.callTool({ name, arguments: args, _meta: { traceId } });
    const text = (result.content as { type: string; text?: string }[]).find((part) => part.type === 'text')?.text ?? 'null';
    if (result.isError) throw new ToolReportedError(`MCP ${name}: ${text}`);
    return JSON.parse(text) as T;
  } finally {
    await client.close();
  }
}

export const mcpGateway: ToolGateway = {
  lookupProduct: (productId, traceId) => callTool('lookup_product', { product_id: productId }, traceId),
  lookupOrder: (orderId, traceId) => callTool('lookup_order', { order_id: orderId }, traceId),
  searchKnowledge: (threadId, scope, query, traceId) => callTool('search_knowledge', { thread_id: threadId, scope, query }, traceId),
  createRequest: (proposal, approvalRequestId, traceId) => {
    const line = { item_size: proposal.itemSize ?? null, item_color: proposal.itemColor ?? null };
    return proposal.action === 'exchange_size'
      ? callTool('create_exchange_request', { order_id: proposal.orderId, product_id: proposal.productId, requested_size: proposal.requestedSize, ...line, approval_request_id: approvalRequestId }, traceId)
      : callTool('create_return_request', { order_id: proposal.orderId, product_id: proposal.productId, reason: proposal.reason, ...line, approval_request_id: approvalRequestId }, traceId);
  },
  searchProducts: (query, maxPriceVnd, traceId) => callTool('search_products', { query, max_price_vnd: maxPriceVnd }, traceId),
  verifyOrder: (threadId, orderId, phone, traceId) => callTool('verify_order', { thread_id: threadId, order_id: orderId, phone }, traceId),
  viewCart: (threadId, traceId) => callTool('view_cart', { thread_id: threadId }, traceId),
  addToCart: (threadId, line, traceId) => callTool('add_to_cart', { thread_id: threadId, product_id: line.productId, size: line.size, color: line.color, quantity: line.quantity }, traceId),
  setCartQuantity: (threadId, line, traceId) => callTool('set_cart_quantity', { thread_id: threadId, product_id: line.productId, size: line.size, color: line.color, quantity: line.quantity }, traceId),
  callExternal: (serverId, toolName, args, inputSchema, traceId) => callExternalTool(serverId, toolName, args, inputSchema, traceId),
  checkout: (threadId, confirmationId, traceId) => callTool('checkout', { thread_id: threadId, confirmation_id: confirmationId }, traceId),
  cancelOrder: (threadId, confirmationId, traceId) => callTool('cancel_order', { thread_id: threadId, confirmation_id: confirmationId }, traceId),
};
