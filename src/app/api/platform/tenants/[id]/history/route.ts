import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { auditFamily } from '@/lib/platform/audit-family';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  const cursor = request.nextUrl.searchParams.get('cursor');
  const take = 50;

  const cursorDate = cursor ? new Date(cursor) : null;
  const createdAtFilter =
    cursorDate && !Number.isNaN(cursorDate.getTime())
      ? { lt: cursorDate }
      : undefined;

  const [auditLogs, planLogs] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where: { tenantId: id, ...(createdAtFilter ? { createdAt: createdAtFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.planChangeLog.findMany({
      where: { tenantId: id, ...(createdAtFilter ? { createdAt: createdAtFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    }),
  ]);

  const logs = planLogs.map((l) => ({
    id: l.id,
    previousPlan: l.previousPlan,
    newPlan: l.newPlan,
    previousPrice: l.previousPrice ? Number(l.previousPrice) : null,
    newPrice: l.newPrice ? Number(l.newPrice) : null,
    changedBy: l.changedBy,
    reason: l.reason,
    addonsSnapshot: l.addonsSnapshot,
    createdAt: l.createdAt.toISOString(),
  }));

  const events = [
    ...auditLogs.map((a) => ({
      source: 'audit' as const,
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      action: a.action,
      family: auditFamily(a.action),
      actorType: a.actorType,
      actorEmail: a.actorEmail,
      targetType: a.targetType,
      targetId: a.targetId,
      before: a.before,
      after: a.after,
    })),
    ...planLogs.map((l) => ({
      source: 'plan_change' as const,
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      action: 'plan.change',
      family: auditFamily('plan.change'),
      actorType: 'platform_admin',
      actorEmail: l.changedBy,
      targetType: 'TenantPlan',
      targetId: id,
      before: { plan: l.previousPlan, price: l.previousPrice ? Number(l.previousPrice) : null },
      after: { plan: l.newPlan, price: l.newPrice ? Number(l.newPrice) : null, reason: l.reason },
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, take);

  const nextCursor = events.length === take ? events[events.length - 1]?.createdAt : null;

  return NextResponse.json({
    logs,
    events,
    nextCursor,
  });
}
