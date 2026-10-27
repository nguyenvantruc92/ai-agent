import { NextResponse } from 'next/server';
import { listApprovals } from '@/features/agent/approvals';
import { requireAdmin } from '@/lib/http';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await listApprovals());
}
