import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { returnReasons } from '@/features/orders/types';

const schemaOnly = async () => {
  throw new Error('Tool calls are executed by graph nodes, not by the model runtime.');
};

export const exchangeArgs = z.object({
  order_id: z.string().describe('Mã đơn, ví dụ FT-2026-1001'),
  product_id: z.string().describe('Mã sản phẩm trong đơn, ví dụ SM-001'),
  requested_size: z.string().describe('Size khách muốn đổi sang, đúng như trong catalog'),
});
export const returnArgs = z.object({
  order_id: z.string(),
  product_id: z.string(),
  reason: z.enum(returnReasons).describe('wrong_item = nhận sai sản phẩm; wrong_size_or_color = sai size/màu so với đơn; manufacturing_defect = lỗi sản xuất'),
});
export const finalAnswerArgs = z.object({
  answer: z.string().describe('Câu trả lời tiếng Việt gửi khách'),
  cited_source_ids: z.array(z.string()).max(8).describe('source_id đã dùng, lấy đúng từ kết quả tool trong lượt này'),
  insufficient_information: z.boolean().describe('true khi thiếu dữ kiện hoặc đang hỏi lại khách thông tin còn thiếu'),
});

/** Schemas the model sees. The two create_* tools only ever reach MCP after human approval. */
export const agentTools = [
  tool(schemaOnly, { name: 'lookup_order', description: 'Tra đơn hàng theo mã đơn: trạng thái, ngày giao, sản phẩm, yêu cầu đổi/trả đã có.', schema: z.object({ order_id: z.string() }) }),
  tool(schemaOnly, { name: 'lookup_product', description: 'Tra sản phẩm trong catalog theo mã: giá, size, màu, tình trạng hàng.', schema: z.object({ product_id: z.string() }) }),
  tool(schemaOnly, { name: 'search_policy', description: 'Tìm chính sách/FAQ của cửa hàng (đổi size, trả hàng, hoàn tiền, giao hàng, thanh toán).', schema: z.object({ query: z.string() }) }),
  tool(schemaOnly, { name: 'create_exchange_request', description: 'Đề xuất tạo yêu cầu ĐỔI SIZE. Hệ thống sẽ kiểm tra điều kiện và chờ nhân viên duyệt trước khi tạo.', schema: exchangeArgs }),
  tool(schemaOnly, { name: 'create_return_request', description: 'Đề xuất tạo yêu cầu TRẢ HÀNG. Hệ thống sẽ kiểm tra điều kiện và chờ nhân viên duyệt trước khi tạo.', schema: returnArgs }),
  tool(schemaOnly, { name: 'final_answer', description: 'Gửi câu trả lời cuối cùng cho khách. Luôn kết thúc lượt bằng tool này.', schema: finalAnswerArgs }),
];

export const readTools = new Set(['lookup_order', 'lookup_product', 'search_policy']);
export const writeTools = new Set(['create_exchange_request', 'create_return_request']);
