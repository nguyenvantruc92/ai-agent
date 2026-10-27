import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApprovalConflictError, decideAndResume } from '@/features/agent/session';
import { requireAdmin } from '@/lib/http';
import { logger } from '@/lib/logger';

type Context = { params: Promise<{ id: string }> };

/** Shared handler for POST /api/admin/approvals/:id/{approve,reject}. */
export function decisionHandler(decision: 'approved' | 'rejected') {
  return async (request: Request, { params }: Context) => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const traceId = randomUUID();
    const body = await request.json().catch(() => ({})) as { note?: unknown };
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    try {
      const outcome = await decideAndResume({ approvalId: (await params).id, decision, reviewer: 'admin', note, traceId });
      return NextResponse.json({ status: outcome.approval.status, resumed: outcome.resumed, traceId, answer: outcome.resumed && outcome.result.kind === 'answer' ? outcome.result.answer.answer : null });
    } catch (error) {
      if (error instanceof ApprovalConflictError) return NextResponse.json({ error: error.message, traceId }, { status: 409 });
      logger.error({ trace_id: traceId, stage: 'approval.resume_failed', error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Đã ghi nhận quyết định nhưng chưa resume được. Bấm lại để thử resume.', traceId }, { status: 500 });
    }
  };
}
