import type { ChatAnswer } from '@/features/chat/schema';

const greeting = /^(chào(?:\s+bạn)?|xin chào(?:\s+bạn)?|hello|hi|alo|hey)[!.\s]*$/i;

/** Non-factual conversational replies do not require retrieval or an LLM call. */
export function smallTalkAnswer(message: string): ChatAnswer | undefined {
  if (!greeting.test(message.trim())) return undefined;
  return {
    answer: 'Chào bạn! Mình có thể hỗ trợ tìm sản phẩm, giá, size, chất liệu và chính sách của Fashion Tomodev. Bạn đang quan tâm sản phẩm nào?',
    citedSourceIds: [],
    insufficientInformation: false,
  };
}
