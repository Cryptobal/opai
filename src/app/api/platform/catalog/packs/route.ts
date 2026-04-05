import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const packs = await prisma.packCatalog.findMany({
    orderBy: { slug: 'asc' },
  });

  return NextResponse.json({
    packs: packs.map((p) => ({
      ...p,
      discountPct: Number(p.discountPct),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}
