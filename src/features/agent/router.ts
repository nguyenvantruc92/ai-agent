import { isPromptInjection } from '@/features/chat/guardrails';
import { smallTalkAnswer } from '@/features/chat/small-talk';
import { isFollowUp } from '@/features/rag/query';

export const orderCodePattern = /(?<![\p{L}\p{N}])FT-\d{4}-\d{4}(?![\p{L}\p{N}])/iu;
const orderIntent = /(?<![\p{L}\p{N}])(?:đơn hàng|đơn của (?:tôi|mình|em|anh|chị)|mã đơn|tra đơn|kiểm tra đơn|(?:muốn|cần|xin|giúp|yêu cầu|tạo yêu cầu) (?:đổi|trả)|đổi giúp|trả lại hàng|hoàn hàng)(?![\p{L}\p{N}])/iu;

export type Route = 'agent' | 'rag' | 'guard';

/**
 * Rule-based routing without an LLM call: prompt injection is refused,
 * order/exchange/return intents go to the tool-calling agent, everything else
 * keeps the Week 6 RAG pipeline.
 */
export function chooseRoute(message: string, context: { orderId: string | null }): Route {
  if (isPromptInjection(message)) return 'guard';
  if (smallTalkAnswer(message)) return 'rag';
  if (orderCodePattern.test(message) || orderIntent.test(message)) return 'agent';
  if (context.orderId && isFollowUp(message)) return 'agent';
  return 'rag';
}
