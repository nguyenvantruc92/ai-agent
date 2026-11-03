/** Provider errors are long and English; staff need to know what to do about them. */
export function friendlyError(message: string) {
  if (/api key/i.test(message)) return 'Chưa cấu hình hoặc sai OPENAI_API_KEY trong .env nên chưa tạo được embedding.';
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
