import { NextResponse } from 'next/server';
import { generateInstructions, generatePromptInput } from '@/features/ai/agent-prompt';
import { audit } from '@/features/orders/repository';
import { apiError, requireAdmin } from '@/lib/http';

/** Writes a system prompt for the agent in the form (does not save anything). */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const input = generatePromptInput.parse(await request.json());
    const result = await generateInstructions(input);
    await audit('admin', 'ai_agent.generate_prompt', 'ai_agent', 'generate-prompt', { model: input.model, scopes: input.scopeIds.length, mcpServers: input.mcpServerIds.length, chars: result.instructions.length });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
