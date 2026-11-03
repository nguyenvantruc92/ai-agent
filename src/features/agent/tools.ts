import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { paymentMethods } from '@/features/orders/customer-schemas';
import { returnReasons } from '@/features/orders/types';

const schemaOnly = async () => {
  throw new Error('Tool calls are executed by graph nodes, not by the model runtime.');
};

const itemSize = z.string().nullable().describe('Chỉ khi đơn có NHIỀU dòng cùng mã sản phẩm: size của dòng khách muốn xử lý; ngược lại null');
const itemColor = z.string().nullable().describe('Chỉ khi đơn có NHIỀU dòng cùng mã sản phẩm: màu của dòng khách muốn xử lý; ngược lại null');
export const exchangeArgs = z.object({
  order_id: z.string().describe('Mã đơn, ví dụ FT-2026-1001'),
  product_id: z.string().describe('Mã sản phẩm trong đơn, ví dụ SM-001'),
  requested_size: z.string().describe('Size khách muốn đổi sang, đúng như trong catalog'),
  item_size: itemSize,
  item_color: itemColor,
});
export const returnArgs = z.object({
  order_id: z.string(),
  product_id: z.string(),
  reason: z.enum(returnReasons).describe('wrong_item = nhận sai sản phẩm; wrong_size_or_color = sai size/màu so với đơn; manufacturing_defect = lỗi sản xuất'),
  item_size: itemSize,
  item_color: itemColor,
});
// Strict tool schemas list every field as required (optional = nullable); when parsing, a missing optional is accepted too.
export const parseExchangeArgs = (args: unknown) => exchangeArgs.partial({ item_size: true, item_color: true }).parse(args);
export const parseReturnArgs = (args: unknown) => returnArgs.partial({ item_size: true, item_color: true }).parse(args);

const phoneField = z.string().nullable().describe('Số điện thoại đặt hàng do KHÁCH nói trong cuộc trò chuyện; null nếu khách chưa cung cấp. Không tự đoán.');
export const lookupOrderArgs = z.object({ order_id: z.string(), phone: phoneField });
export const searchProductsArgs = z.object({
  query: z.string().describe('Từ khóa: loại sản phẩm, màu, mã, ví dụ "áo polo trắng"'),
  max_price_vnd: z.number().int().nullable().describe('Giá tối đa (VND) nếu khách nêu ngân sách; không thì null'),
});
export const cartLineArgs = z.object({
  product_id: z.string().describe('Mã sản phẩm, ví dụ PL-002 (lấy từ search_products/lookup_product)'),
  size: z.string().describe('Size đúng như catalog'),
  color: z.string().nullable().describe('Màu đúng như catalog; null nếu sản phẩm chỉ có một màu'),
  quantity: z.number().int().describe('Số lượng; với set_cart_quantity, 0 = xóa dòng khỏi giỏ'),
});
export const checkoutArgs = z.object({
  name: z.string().describe('Họ tên người nhận do khách cung cấp'),
  phone: z.string().describe('Số điện thoại người nhận do khách cung cấp'),
  address: z.string().describe('Địa chỉ giao hàng đầy đủ do khách cung cấp'),
  note: z.string().nullable().describe('Ghi chú cho đơn hàng nếu có'),
  payment_method: z.enum(paymentMethods).describe('COD = thanh toán khi nhận hàng; bank_transfer = chuyển khoản; card = thẻ'),
});
export const cancelOrderArgs = z.object({ order_id: z.string(), phone: phoneField });
export const finalAnswerArgs = z.object({
  answer: z.string().describe('Câu trả lời tiếng Việt gửi khách'),
  cited_source_ids: z.array(z.string()).max(8).describe('source_id đã dùng, lấy đúng từ kết quả tool trong lượt này'),
  insufficient_information: z.boolean().describe('true khi thiếu dữ kiện hoặc đang hỏi lại khách thông tin còn thiếu'),
});

/** Schemas the model sees. The two create_* tools only ever reach MCP after human approval. */
export const agentTools = [
  tool(schemaOnly, { name: 'lookup_order', description: 'Tra đơn hàng theo mã đơn: trạng thái, thanh toán, ngày giao, sản phẩm, yêu cầu đổi/trả đã có. Cần xác minh: đơn đặt từ chính trình duyệt này, hoặc khách cung cấp đúng số điện thoại đặt hàng.', schema: lookupOrderArgs }),
  tool(schemaOnly, { name: 'search_products', description: 'Tìm sản phẩm đang bán (tối đa 5) theo từ khóa và ngân sách: mã, giá, màu, size còn hàng. Dùng khi khách muốn mua mà chưa rõ mã sản phẩm.', schema: searchProductsArgs }),
  tool(schemaOnly, { name: 'view_cart', description: 'Xem giỏ hàng hiện tại của khách: các dòng, số lượng, phí giao hàng và tổng tiền do hệ thống tính.', schema: z.object({}) }),
  tool(schemaOnly, { name: 'add_to_cart', description: 'Thêm một sản phẩm (mã + size + màu + số lượng) vào giỏ hàng. Chỉ thêm vào giỏ, chưa đặt hàng.', schema: cartLineArgs }),
  tool(schemaOnly, { name: 'set_cart_quantity', description: 'Đổi số lượng của một dòng đã có trong giỏ; quantity 0 để xóa dòng đó.', schema: cartLineArgs }),
  tool(schemaOnly, { name: 'checkout', description: 'Đề xuất ĐẶT HÀNG từ giỏ hiện tại với thông tin giao hàng của khách. Hệ thống hiện thông tin để khách bấm Xác nhận; chỉ khi khách xác nhận đơn mới được tạo.', schema: checkoutArgs }),
  tool(schemaOnly, { name: 'cancel_order', description: 'Đề xuất HỦY một đơn đang xử lý và chưa thanh toán. Hệ thống hỏi khách bấm Xác nhận trước khi hủy.', schema: cancelOrderArgs }),
  tool(schemaOnly, { name: 'lookup_product', description: 'Tra sản phẩm trong catalog theo mã: giá, size, màu, tình trạng hàng.', schema: z.object({ product_id: z.string() }) }),
  tool(schemaOnly, { name: 'search_policy', description: 'Tìm chính sách/FAQ của cửa hàng (đổi size, trả hàng, hoàn tiền, giao hàng, thanh toán).', schema: z.object({ query: z.string() }) }),
  tool(schemaOnly, { name: 'create_exchange_request', description: 'Đề xuất tạo yêu cầu ĐỔI SIZE. Hệ thống sẽ kiểm tra điều kiện và chờ nhân viên duyệt trước khi tạo.', schema: exchangeArgs }),
  tool(schemaOnly, { name: 'create_return_request', description: 'Đề xuất tạo yêu cầu TRẢ HÀNG. Hệ thống sẽ kiểm tra điều kiện và chờ nhân viên duyệt trước khi tạo.', schema: returnArgs }),
  tool(schemaOnly, { name: 'final_answer', description: 'Gửi câu trả lời cuối cùng cho khách. Luôn kết thúc lượt bằng tool này.', schema: finalAnswerArgs }),
];

export const readTools = new Set(['lookup_order', 'lookup_product', 'search_policy', 'search_products', 'view_cart']);
/** Cart edits are reversible, so they run immediately; spending money or cancelling needs the customer's confirmation. */
export const cartTools = new Set(['add_to_cart', 'set_cart_quantity']);
export const confirmTools = new Set(['checkout', 'cancel_order']);
/** Tools whose use means the cart or an order may have changed (the storefront header refreshes). */
export const storefrontTools = new Set([...cartTools, ...confirmTools]);
export const writeTools = new Set(['create_exchange_request', 'create_return_request']);
