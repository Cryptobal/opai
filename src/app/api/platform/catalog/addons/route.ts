import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

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
