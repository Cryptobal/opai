import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  const logs = await prisma.planChangeLog.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      previousPlan: l.previousPlan,
      newPlan: l.newPlan,
      previousPrice: l.previousPrice ? Number(l.previousPrice) : null,
      newPrice: l.newPrice ? Number(l.newPrice) : null,
      changedBy: l.changedBy,
      reason: l.reason,
      addonsSnapshot: l.addonsSnapshot,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
