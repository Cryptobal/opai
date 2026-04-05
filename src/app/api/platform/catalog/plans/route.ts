import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const plans = await prisma.planCatalog.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json({
    plans: plans.map((p) => ({
      ...p,
      pricePerGuard: Number(p.pricePerGuard),
      baseMinimum: Number(p.baseMinimum),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}
