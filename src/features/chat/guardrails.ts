import type { ChatAnswer } from '@/features/chat/schema';

// Basic prompt-injection patterns (Vietnamese and English). Blocked before any model call.
const injectionPatterns = [
  /(?:bỏ qua|phớt lờ|quên|bỏ hết)\s+(?:mọi|tất cả|toàn bộ|các|những)?\s*(?:hướng dẫn|chỉ dẫn|quy tắc|lệnh|chỉ thị)/iu,
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|rules|prompts?)/i,
  /(?:tiết lộ|in ra|hiển thị|cho (?:tôi )?xem|đưa ra|show|reveal|print|repeat)\b.{0,40}(?:system prompt|prompt hệ thống|chỉ dẫn hệ thống|cấu hình nội bộ|api[\s_-]?key|khóa api)/iu,
  /(?:system prompt|api[\s_-]?key)\b.{0,30}(?:là gì|của bạn|đang dùng)/iu,
  /\b(?:developer mode|jailbreak|DAN mode)\b/i,
  /(?:từ giờ|bây giờ)\s+bạn\s+(?:là|đóng vai)\s+(?!trợ lý)/iu,
];

export function isPromptInjection(message: string) {
  return injectionPatterns.some((pattern) => pattern.test(message));
}

export const injectionRefusal: ChatAnswer = {
  answer: 'Mình chỉ hỗ trợ thông tin sản phẩm, chính sách, tra đơn và yêu cầu đổi size/trả hàng của Fashion Tomodev, nên không thể thực hiện yêu cầu này. Bạn cần hỗ trợ gì về sản phẩm hoặc đơn hàng không?',
  citedSourceIds: [],
  insufficientInformation: true,
};
