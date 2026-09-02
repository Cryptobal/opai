import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { logPlatformAction, platformActor } from '@/lib/platform/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const allowed = [
    'name', 'headline', 'description', 'pricePerGuard', 'baseMinimum',
    'maxGuards', 'maxAdmins', 'maxStorageMb', 'includedModules',
    'trialDays', 'sortOrder', 'featured', 'active',
  ];
  const data: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) data[f] = body[f];
  }

  const updated = await prisma.planCatalog.update({ where: { id }, data });

  await logPlatformAction({
    ...platformActor(ctx),
    action: 'catalog.plan.upsert',
    targetType: 'PlanCatalog',
    targetId: id,
    after: data as Record<string, unknown>,
    request,
  });

  return NextResponse.json({
    success: true,
    plan: {
      ...updated,
      pricePerGuard: Number(updated.pricePerGuard),
      baseMinimum: Number(updated.baseMinimum),
    },
  });
}
