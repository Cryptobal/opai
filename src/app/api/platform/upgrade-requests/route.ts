import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

const STATUSES = new Set(['open', 'contacted', 'won', 'lost']);

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const status = request.nextUrl.searchParams.get('status') ?? 'open';
  const requests = await prisma.upgradeRequest.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      tenantSlug: r.tenant.slug,
      requestedBy: r.requestedBy,
      requestedPlan: r.requestedPlan,
      requestedAddons: r.requestedAddons,
      message: r.message,
      status: r.status,
      handledBy: r.handledBy,
      handledAt: r.handledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
