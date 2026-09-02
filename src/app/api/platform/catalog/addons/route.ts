import { NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const addons = await prisma.addonCatalog.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json({
    addons: addons.map((a) => ({
      ...a,
      priceAmount: Number(a.priceAmount),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
}
