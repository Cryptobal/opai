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
    'name', 'description', 'pricingModel', 'priceAmount',
    'priceUnit', 'moduleKey', 'tag', 'sortOrder', 'active',
  ];
  const data: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) data[f] = body[f];
  }

  if (typeof data.moduleKey === 'string') {
    const { validateModuleKey } = await import('@/lib/platform/catalog-validate');
    const err = validateModuleKey(data.moduleKey);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const updated = await prisma.addonCatalog.update({ where: { id }, data });

  await logPlatformAction({
    ...platformActor(ctx),
    action: 'catalog.addon.upsert',
    targetType: 'AddonCatalog',
    targetId: id,
    after: data as Record<string, unknown>,
    request,
  });

  return NextResponse.json({
    success: true,
    addon: {
      ...updated,
      priceAmount: Number(updated.priceAmount),
    },
  });
}
