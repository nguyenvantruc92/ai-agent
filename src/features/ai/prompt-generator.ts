import { agentPromptWriter } from '@/features/ai/prompt';
import type { ToolKind } from '@/features/agent/tools';
import { HttpError } from '@/lib/http';

/** Everything the writer is told about the agent: its purpose and the tools it will have. */
export type PromptBrief = {
  agentName: string;
  /** What the admin wants this agent to be (role, shop info, tone, special rules). */
  purpose: string;
  builtin: { name: string; description: string; kind: ToolKind }[];
  scopes: { name: string; toolName: string; description: string }[];
  externals: { name: string; serverName: string; description: string; requiresApproval: boolean }[];
  /** The agent's current prompt, to be improved rather than replaced. */
  currentInstructions?: string;
};

export const MAX_GENERATED_PROMPT = 12_000;

const kindNote: Record<ToolKind, string> = {
  read: 'chỉ đọc dữ liệu, chạy ngay',
  cart: 'sửa giỏ hàng, chạy ngay, chưa đặt hàng',
  confirm: 'khách phải bấm Xác nhận trong khung chat thì mới thực hiện',
  approval: 'chờ nhân viên duyệt mới tạo',
};

/** The agent's description as the writer reads it (user message). */
export function describeAgent(brief: PromptBrief) {
  const lines = [`TÊN AGENT: ${brief.agentName}`, `MÔ TẢ CỦA ADMIN (vai trò, thông tin cửa hàng, giọng điệu, ý muốn riêng):\n${brief.purpose.trim() || '(admin chưa mô tả; hãy viết prompt chăm sóc khách hàng thời trang nam lịch sự, ngắn gọn)'}`];
  lines.push(`TOOL CÓ SẴN (${brief.builtin.length}):\n${brief.builtin.length ? brief.builtin.map((tool) => `- ${tool.name} [${kindNote[tool.kind]}]: ${tool.description}`).join('\n') : '(không có)'}`);
  lines.push(`KNOWLEDGE SCOPE (mỗi scope là một tool tra cứu tài liệu) (${brief.scopes.length}):\n${brief.scopes.length ? brief.scopes.map((scope) => `- ${scope.toolName} (${scope.name}): ${scope.description}`).join('\n') : '(không có)'}`);
  lines.push(`TOOL CỦA MCP SERVER NGOÀI (${brief.externals.length}):\n${brief.externals.length ? brief.externals.map((tool) => `- ${tool.name} [${tool.requiresApproval ? 'cần nhân viên duyệt' : 'chạy ngay'}] (${tool.serverName}): ${tool.description || '(không có mô tả)'}`).join('\n') : '(không có)'}`);
  if (brief.currentInstructions?.trim()) lines.push(`PROMPT HIỆN TẠI CỦA AGENT (cải thiện, không bỏ phần admin đã viết riêng còn phù hợp):\n"""\n${brief.currentInstructions.trim()}\n"""`);
  return lines.join('\n\n');
}

/** Sends the writer's instructions and the agent description to a model; returns the text. */
export type Complete = (system: string, user: string) => Promise<string>;

/** Models sometimes wrap the answer in a code fence or add a heading line; the stored prompt should be the prompt only. */
export function cleanGeneratedPrompt(raw: string) {
  const text = raw.trim().replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();
  if (text.length < 100) throw new HttpError('AI chưa viết được prompt hợp lệ. Hãy thử lại hoặc mô tả Agent kỹ hơn.', 502);
  if (text.length > MAX_GENERATED_PROMPT) throw new HttpError(`Prompt AI viết quá dài (${text.length} ký tự, tối đa ${MAX_GENERATED_PROMPT}). Hãy thử lại với mô tả ngắn gọn hơn.`, 502);
  return text;
}

export async function generateAgentPrompt(complete: Complete, brief: PromptBrief) {
  return cleanGeneratedPrompt(await complete(agentPromptWriter, describeAgent(brief)));
}
