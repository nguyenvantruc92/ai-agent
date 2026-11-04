import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { addToCartForThread, cancelOrderConfirmed, checkoutConfirmed, searchProductsForAgent, setCartQuantityForThread, verifyOrderForThread, viewCartForThread } from '@/features/agent/shop-tools';
import { findProduct } from '@/features/catalog/repository';
import { createApprovedRequest, findOrder } from '@/features/orders/repository';
import { returnReasons } from '@/features/orders/types';
import { searchScopeForThread } from '@/features/knowledge/scopes';
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
// Identity comes from the chat thread (filled in by the server, never by the model), so a tool can only touch that visitor's cart and orders.
const threadId = z.string().uuid().describe('ID cuộc trò chuyện do server điền; xác định khách, không lấy từ model.');
const confirmationId = z.string().uuid().describe('ID xác nhận của khách (bấm Xác nhận trong khung chat); do server điền.');
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
  server.registerTool('search_products', {
    description: 'Tìm sản phẩm đang bán theo từ khóa (tên, mã, danh mục), tùy chọn giá tối đa. Trả tối đa 5 sản phẩm kèm size/màu còn hàng.',
    inputSchema: { query: z.string().min(1).max(100), max_price_vnd: z.number().int().positive().nullable().optional() },
    annotations: read,
  }, handler<{ query: string; max_price_vnd?: number | null }>('search_products', ({ query, max_price_vnd }) => searchProductsForAgent(query, max_price_vnd ?? null)));
  server.registerTool('verify_order', {
    description: 'Xác minh khách sở hữu đơn (đặt từ chính trình duyệt này hoặc đúng số điện thoại trên đơn) rồi trả đơn.',
    inputSchema: { thread_id: threadId, order_id: z.string().min(3).max(30), phone: z.string().max(30).nullable().optional() },
    annotations: read,
  }, handler<{ thread_id: string; order_id: string; phone?: string | null }>('verify_order', (args) => verifyOrderForThread(args.thread_id, args.order_id, args.phone ?? null)));
  server.registerTool('view_cart', {
    description: 'Xem giỏ hàng hiện tại của khách: sản phẩm, số lượng, giá, phí giao hàng, tổng tiền (server tính).',
    inputSchema: { thread_id: threadId },
    annotations: read,
  }, handler<{ thread_id: string }>('view_cart', ({ thread_id }) => viewCartForThread(thread_id)));
  const lineArgs = { thread_id: threadId, product_id: z.string().min(2).max(20), size: z.string().min(1).max(20), color: z.string().max(40).nullable().optional() };
  server.registerTool('add_to_cart', {
    description: 'Thêm sản phẩm (mã + size + màu) vào giỏ hàng của khách. Không đặt hàng.',
    inputSchema: { ...lineArgs, quantity: z.number().int().min(1).max(10) },
    annotations: write,
  }, handler<{ thread_id: string; product_id: string; size: string; color?: string | null; quantity: number }>('add_to_cart', (args) =>
    addToCartForThread(args.thread_id, { productCode: args.product_id, size: args.size, color: args.color ?? null, quantity: args.quantity })));
  server.registerTool('set_cart_quantity', {
    description: 'Đặt số lượng của một dòng trong giỏ hàng; số lượng 0 là xóa dòng đó.',
    inputSchema: { ...lineArgs, quantity: z.number().int().min(0).max(10) },
    annotations: { ...write, destructiveHint: false },
  }, handler<{ thread_id: string; product_id: string; size: string; color?: string | null; quantity: number }>('set_cart_quantity', (args) =>
    setCartQuantityForThread(args.thread_id, { productCode: args.product_id, size: args.size, color: args.color ?? null, quantity: args.quantity })));
  server.registerTool('checkout', {
    description: 'Đặt hàng từ giỏ hiện tại. Chỉ chạy khi khách đã bấm Xác nhận (confirmation_id); thông tin giao hàng lấy từ nội dung khách đã xác nhận.',
    inputSchema: { thread_id: threadId, confirmation_id: confirmationId },
    annotations: { ...write, destructiveHint: true },
  }, handler<{ thread_id: string; confirmation_id: string }>('checkout', (args) => checkoutConfirmed(args.thread_id, args.confirmation_id)));
  server.registerTool('cancel_order', {
    description: 'Hủy đơn đang xử lý và chưa thanh toán. Chỉ chạy khi khách đã bấm Xác nhận (confirmation_id).',
    inputSchema: { thread_id: threadId, confirmation_id: confirmationId },
    annotations: { ...write, destructiveHint: true },
  }, handler<{ thread_id: string; confirmation_id: string }>('cancel_order', (args) => cancelOrderConfirmed(args.thread_id, args.confirmation_id)));
  server.registerTool('search_knowledge', {
    description: 'Tìm trong một Knowledge scope (tài liệu admin gán) bằng RAG. Scope phải được bật cho Agent sở hữu cuộc trò chuyện.',
    inputSchema: { thread_id: threadId, scope: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/), query: z.string().min(2).max(500) },
    annotations: read,
  }, handler<{ thread_id: string; scope: string; query: string }>('search_knowledge', (args, traceId) => searchScopeForThread(args.thread_id, args.scope, args.query, traceId)));
  server.registerTool('create_exchange_request', {
    description: 'Tạo yêu cầu đổi size giả lập. Chỉ chạy khi approval_request_id đã được duyệt.',
    inputSchema: { order_id: z.string(), product_id: z.string(), requested_size: z.string().min(1).max(20), item_size: z.string().max(20).nullable().optional(), item_color: z.string().max(40).nullable().optional(), approval_request_id: approvalId },
    annotations: write,
  }, handler<{ order_id: string; product_id: string; requested_size: string; item_size?: string | null; item_color?: string | null; approval_request_id: string }>('create_exchange_request', (args) =>
    createApprovedRequest({ action: 'exchange_size', orderId: args.order_id, productId: args.product_id, requestedSize: args.requested_size, itemSize: args.item_size ?? undefined, itemColor: args.item_color ?? undefined }, args.approval_request_id)));
  server.registerTool('create_return_request', {
    description: 'Tạo yêu cầu trả hàng giả lập. Chỉ chạy khi approval_request_id đã được duyệt.',
    inputSchema: { order_id: z.string(), product_id: z.string(), reason: z.enum(returnReasons), item_size: z.string().max(20).nullable().optional(), item_color: z.string().max(40).nullable().optional(), approval_request_id: approvalId },
    annotations: write,
  }, handler<{ order_id: string; product_id: string; reason: string; item_size?: string | null; item_color?: string | null; approval_request_id: string }>('create_return_request', (args) =>
    createApprovedRequest({ action: 'return', orderId: args.order_id, productId: args.product_id, reason: args.reason, itemSize: args.item_size ?? undefined, itemColor: args.item_color ?? undefined }, args.approval_request_id)));
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
