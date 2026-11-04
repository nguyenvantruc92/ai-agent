/** Provider errors are long and English; staff need to know what to do about them. */
export function friendlyError(message: string) {
  if (/api key/i.test(message)) return 'Chưa cấu hình hoặc sai khóa OpenAI nên chưa tạo được embedding. Vào Admin → Cài đặt để nhập khóa.';
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
