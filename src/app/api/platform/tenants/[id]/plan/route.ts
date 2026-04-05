import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { PLAN_MODULES } from '@/lib/tenant-modules';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const existingPlan = await prisma.tenantPlan.findUnique({
    where: { tenantId: id },
  });

  if (!existingPlan) {
    return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  const fields = [
    'plan', 'maxGuards', 'maxAdmins', 'maxStorageMb',
    'basePrice', 'pricePerGuard', 'currency', 'billingStatus', 'trialEndsAt',
  ];
  for (const field of fields) {
    if (field in body) data[field] = body[field];
  }

  // Normalize legacy plan names
  if (body.plan) {
    const nameMap: Record<string, string> = { trial: 'free', essential: 'starter', professional: 'profesional' };
    data.plan = nameMap[body.plan] || body.plan;
  }

  // If plan changed, auto-update modules
  if (data.plan && data.plan !== existingPlan.plan) {
    const newModules = PLAN_MODULES[data.plan as string] || [];

    await prisma.tenantModule.updateMany({
      where: { tenantId: id },
      data: { enabled: false },
    });

    for (const mod of newModules) {
      await prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: mod } },
        update: { enabled: true },
        create: { tenantId: id, module: mod, enabled: true },
      });
    }
  }

  const updated = await prisma.tenantPlan.update({
    where: { tenantId: id },
    data,
  });

  return NextResponse.json({
    success: true,
    plan: {
      plan: updated.plan, maxGuards: updated.maxGuards,
      maxAdmins: updated.maxAdmins, maxStorageMb: updated.maxStorageMb,
      basePrice: Number(updated.basePrice), pricePerGuard: Number(updated.pricePerGuard),
      currency: updated.currency, billingStatus: updated.billingStatus,
      trialEndsAt: updated.trialEndsAt?.toISOString() || null,
    },
  });
}
