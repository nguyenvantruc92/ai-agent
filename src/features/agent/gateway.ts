import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Order, Product, RequestProposal } from '@/features/orders/types';
import { env } from '@/lib/env';

export type PolicyHit = { source_id: string; title: string; content: string; similarity: number; updated_at: string };
export type CreatedRequest = { requestId: string; status: string; created: boolean; createdAt: string | null };

/** Everything the graph may do outside itself. Read tools are free; writes need an approved approval id. */
export type ToolGateway = {
  lookupProduct(productId: string, traceId: string): Promise<Product | null>;
  lookupOrder(orderId: string, traceId: string): Promise<Order | null>;
  searchPolicy(query: string, traceId: string): Promise<PolicyHit[]>;
  createRequest(proposal: RequestProposal, approvalRequestId: string, traceId: string): Promise<CreatedRequest>;
};

async function callTool<T>(name: string, args: Record<string, unknown>, traceId: string): Promise<T> {
  const client = new Client({ name: 'fashion-tomodev-agent', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(env.MCP_URL)));
  try {
    const result = await client.callTool({ name, arguments: args, _meta: { traceId } });
    const text = (result.content as { type: string; text?: string }[]).find((part) => part.type === 'text')?.text ?? 'null';
    if (result.isError) throw new Error(`MCP ${name}: ${text}`);
    return JSON.parse(text) as T;
  } finally {
    await client.close();
  }
}

export const mcpGateway: ToolGateway = {
  lookupProduct: (productId, traceId) => callTool('lookup_product', { product_id: productId }, traceId),
  lookupOrder: (orderId, traceId) => callTool('lookup_order', { order_id: orderId }, traceId),
  searchPolicy: (query, traceId) => callTool('search_policy', { query }, traceId),
  createRequest: (proposal, approvalRequestId, traceId) => proposal.action === 'exchange_size'
    ? callTool('create_exchange_request', { order_id: proposal.orderId, product_id: proposal.productId, requested_size: proposal.requestedSize, approval_request_id: approvalRequestId }, traceId)
    : callTool('create_return_request', { order_id: proposal.orderId, product_id: proposal.productId, reason: proposal.reason, approval_request_id: approvalRequestId }, traceId),
};
