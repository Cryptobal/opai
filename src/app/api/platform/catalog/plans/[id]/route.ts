import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { logPlatformAction, platformActor } from '@/lib/platform/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'owner' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

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

  const existing = await prisma.planCatalog.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
  }

  if ('includedModules' in data) {
    const { validateIncludedModules } = await import('@/lib/platform/catalog-validate');
    const checked = validateIncludedModules(existing.slug, data.includedModules);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    data.includedModules = checked.keys;
  }

  const updated = await prisma.planCatalog.update({ where: { id }, data });

  await logPlatformAction({
    ...platformActor(ctx),
    action: 'catalog.plan.update',
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
