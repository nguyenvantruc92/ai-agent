import { env } from '@/lib/env';
import { redactText, ref } from '@/lib/redact';

/**
 * The `chat.received` trace line. A customer message can hold a name, address or phone in any format, which no regex
 * catches reliably, so only its length is logged. `LOG_CHAT_TEXT=true` (local debugging only) adds a redacted copy.
 */
export function chatReceivedLog(traceId: string, threadId: string, message: string) {
  return {
    trace_id: traceId,
    stage: 'chat.received',
    threadRef: ref(threadId),
    questionChars: message.length,
    ...(env.LOG_CHAT_TEXT ? { questionRedacted: redactText(message) } : {}),
  };
}
