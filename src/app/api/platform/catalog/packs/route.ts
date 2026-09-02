import { NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

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
