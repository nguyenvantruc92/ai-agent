import { z } from 'zod';
import { env } from '@/lib/env';

// Control characters other than newline/tab never carry meaning in a chat message.
const stripControl = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

/** The browser may send only these two fields; sources, prompts, models and history are server-owned. */
export const chatRequestSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().transform(stripControl).pipe(z.string().trim().min(1).max(env.MAX_USER_MESSAGE_CHARS)),
}).strict();

export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(4_000),
  citedSourceIds: z.array(z.string()).max(5),
  insufficientInformation: z.boolean(),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const insufficientAnswer: ChatAnswer = {
  answer: 'Fashion Tomodev chưa có đủ thông tin trong dữ liệu hiện có để trả lời chính xác câu hỏi này.',
  citedSourceIds: [],
  insufficientInformation: true,
};
