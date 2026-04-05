import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

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

  return NextResponse.json({
    success: true,
    plan: {
      ...updated,
      pricePerGuard: Number(updated.pricePerGuard),
      baseMinimum: Number(updated.baseMinimum),
    },
  });
}
