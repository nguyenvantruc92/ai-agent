import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createApprovedRequest, findOrder, findProduct } from '@/features/orders/repository';
import { returnReasons } from '@/features/orders/types';
import { retrieve } from '@/features/rag/retrieval';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

type Extra = { _meta?: Record<string, unknown> };

/** Wraps a handler with JSON output and a trace line per call. */
function handler<A>(name: string, run: (args: A, traceId: string) => Promise<unknown>) {
  return async (args: A, extra: Extra) => {
    const traceId = typeof extra._meta?.traceId === 'string' ? extra._meta.traceId : randomUUID();
    const startedAt = Date.now();
    try {
      const result = await run(args, traceId);
      logger.info({ trace_id: traceId, stage: 'mcp.tool', tool: name, args, latencyMs: Date.now() - startedAt });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ trace_id: traceId, stage: 'mcp.tool_failed', tool: name, args, error: message, latencyMs: Date.now() - startedAt });
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
  };
}

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const approvalId = z.string().uuid().describe('ID approval đã được nhân viên duyệt; do server điền, không lấy từ khách.');

function buildServer() {
  const server = new McpServer({ name: 'fashion-tomodev', version: '1.0.0' });
  server.registerTool('lookup_product', {
    description: 'Tra một sản phẩm trong catalog đang active theo mã (ví dụ SM-001).',
    inputSchema: { product_id: z.string().min(2).max(20) },
    annotations: read,
  }, handler<{ product_id: string }>('lookup_product', ({ product_id }) => findProduct(product_id)));
  server.registerTool('lookup_order', {
    description: 'Tra đơn hàng giả lập theo mã (ví dụ FT-2026-1001), gồm sản phẩm và yêu cầu đổi/trả đã có.',
    inputSchema: { order_id: z.string().min(3).max(30) },
    annotations: read,
  }, handler<{ order_id: string }>('lookup_order', ({ order_id }) => findOrder(order_id)));
  server.registerTool('search_policy', {
    description: 'Tìm các mục FAQ/chính sách liên quan bằng RAG.',
    inputSchema: { query: z.string().min(2).max(500) },
    annotations: read,
  }, handler<{ query: string }>('search_policy', async ({ query }, traceId) => {
    const { chunks } = await retrieve({ query, message: query, traceId, policyOnly: true });
    return chunks.map((chunk) => ({ source_id: chunk.source_id, title: chunk.title, content: chunk.content, similarity: Number(chunk.similarity.toFixed(4)), updated_at: String(chunk.metadata.updated_at ?? '') }));
  }));
  server.registerTool('create_exchange_request', {
    description: 'Tạo yêu cầu đổi size giả lập. Chỉ chạy khi approval_request_id đã được duyệt.',
    inputSchema: { order_id: z.string(), product_id: z.string(), requested_size: z.string().min(1).max(20), approval_request_id: approvalId },
    annotations: write,
  }, handler<{ order_id: string; product_id: string; requested_size: string; approval_request_id: string }>('create_exchange_request', (args) =>
    createApprovedRequest({ action: 'exchange_size', orderId: args.order_id, productId: args.product_id, requestedSize: args.requested_size }, args.approval_request_id)));
  server.registerTool('create_return_request', {
    description: 'Tạo yêu cầu trả hàng giả lập. Chỉ chạy khi approval_request_id đã được duyệt.',
    inputSchema: { order_id: z.string(), product_id: z.string(), reason: z.enum(returnReasons), approval_request_id: approvalId },
    annotations: write,
  }, handler<{ order_id: string; product_id: string; reason: string; approval_request_id: string }>('create_return_request', (args) =>
    createApprovedRequest({ action: 'return', orderId: args.order_id, productId: args.product_id, reason: args.reason }, args.approval_request_id)));
  return server;
}

// Stateless Streamable HTTP: a fresh server/transport per request, reachable only inside the Docker network.
createServer(async (request, response) => {
  if (request.url !== '/mcp') { response.writeHead(404).end(); return; }
  if (request.method !== 'POST') { response.writeHead(405).end(); return; }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  response.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    logger.error({ stage: 'mcp.request_failed', error: error instanceof Error ? error.message : String(error) });
    if (!response.headersSent) response.writeHead(500).end();
  }
}).listen(env.MCP_PORT, '0.0.0.0', () => logger.info({ stage: 'mcp.started', port: env.MCP_PORT }));
