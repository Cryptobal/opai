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

  const allowed = ['name', 'description', 'addonSlugs', 'discountPct', 'active'];
  const data: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) data[f] = body[f];
  }

  const updated = await prisma.packCatalog.update({ where: { id }, data });

  await logPlatformAction({
    ...platformActor(ctx),
    action: 'catalog.pack.upsert',
    targetType: 'PackCatalog',
    targetId: id,
    after: data as Record<string, unknown>,
    request,
  });

  return NextResponse.json({
    success: true,
    pack: {
      ...updated,
      discountPct: Number(updated.discountPct),
    },
  });
}
