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
    'name', 'description', 'pricingModel', 'priceAmount',
    'priceUnit', 'moduleKey', 'tag', 'sortOrder', 'active',
  ];
  const data: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) data[f] = body[f];
  }

  const updated = await prisma.addonCatalog.update({ where: { id }, data });

  return NextResponse.json({
    success: true,
    addon: {
      ...updated,
      priceAmount: Number(updated.priceAmount),
    },
  });
}
