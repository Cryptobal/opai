import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { provisionTenant } from '@/lib/tenant-provisioning';

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const sort = searchParams.get('sort') || 'createdAt';
  const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

  const where: Record<string, unknown> = {};
  if (status === 'active') where.active = true;
  if (status === 'suspended') where.active = false;
  if (status === 'trial') {
    where.active = true;
    where.plan = { billingStatus: 'trial' };
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        admins: {
          select: { id: true, lastLoginAt: true },
          where: { status: 'active' },
        },
      },
      orderBy: sort === 'name' ? { name: order } : { createdAt: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds }, status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  const tenantList = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    active: t.active,
    plan: t.plan?.plan || 'trial',
    billingStatus: t.plan?.billingStatus || 'trial',
    activeGuards: guardMap.get(t.id) || 0,
    adminCount: t.admins.length,
    lastLoginAt: t.admins.reduce<string | null>((latest, a) => {
      if (!a.lastLoginAt) return latest;
      const iso = a.lastLoginAt.toISOString();
      if (!latest || iso > latest) return iso;
      return latest;
    }, null),
    createdAt: t.createdAt.toISOString(),
    trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
  }));

  return NextResponse.json({
    tenants: tenantList,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  try {
    const body = await request.json();
    const { name, slug, companyRut, ownerName, ownerEmail, ownerPassword, plan, trialDays } = body;

    if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword || !plan) {
      return NextResponse.json(
        { error: 'Campos requeridos: name, slug, ownerName, ownerEmail, ownerPassword, plan' },
        { status: 400 },
      );
    }

    const result = await provisionTenant({
      name, slug, companyRut, ownerName, ownerEmail, ownerPassword, plan, trialDays,
    });

    await prisma.tenant.update({
      where: { id: result.tenant.id },
      data: { onboardedBy: ctx.email },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al crear tenant';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
