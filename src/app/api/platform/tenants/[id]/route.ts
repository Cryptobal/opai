import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { deleteTenant } from '@/lib/tenant-deletion';
import { logAudit } from '@/lib/audit';
import {
  allowedLifecycleActions,
  deriveTenantAccess,
  serializeAccess,
} from '@/lib/platform/tenant-lifecycle';
import { getLifecycleSettings } from '@/lib/platform/settings';
import { computeTenantMonthly, serializeTenantMonthly } from '@/lib/platform/pricing';
import { getUfValue } from '@/lib/uf';
import { tenantStatusUi } from '@/lib/platform/status-ui';
import { monthlyDisplay } from '@/lib/platform/status-ui';
import {
  LIFECYCLE_ACTION_LABELS,
  lifecycleRequiresReason,
} from '@/lib/platform/lifecycle-labels';
import { serializePlatformTenant } from '@/lib/platform/tenant-row';

// Tenants protegidos — no se pueden borrar desde la UI bajo ninguna circunstancia.
const PROTECTED_SLUGS = new Set<string>(['gard']);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: true,
      modules: true,
      admins: {
        select: {
          id: true, name: true, email: true, role: true, status: true, lastLoginAt: true,
        },
      },
      tenantAddons: {
        where: { enabled: true },
        include: { addon: true },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeGuards, totalGuards, marcaciones30d, documentos30d, rondas30d, activePuestos, packs, ufValue, settings, empresaRows, catalogPlan, lifecycleLogs] =
    await Promise.all([
      prisma.opsGuardia.count({ where: { tenantId: id, status: 'active' } }),
      prisma.opsGuardia.count({ where: { tenantId: id } }),
      prisma.opsMarcacion.count({ where: { tenantId: id, timestamp: { gte: thirtyDaysAgo } } }),
      prisma.document.count({ where: { tenantId: id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.opsRondaEjecucion.count({ where: { tenantId: id, startedAt: { gte: thirtyDaysAgo } } }),
      prisma.opsPuestoOperativo.count({ where: { tenantId: id, active: true } }),
      prisma.packCatalog.findMany(),
      getUfValue().catch(() => null),
      getLifecycleSettings(),
      prisma.setting.findMany({
        where: {
          tenantId: id,
          key: { in: ['empresa.giro', 'empresa.telefono', 'empresa.direccion'] },
        },
        select: { key: true, value: true },
      }),
      tenant.plan
        ? prisma.planCatalog.findUnique({ where: { slug: tenant.plan.plan } })
        : Promise.resolve(null),
      prisma.platformAuditLog.findMany({
        where: { tenantId: id, action: { startsWith: 'lifecycle.' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  const access = deriveTenantAccess(
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      active: tenant.active,
      suspendedAt: tenant.suspendedAt,
      plan: tenant.plan
        ? {
            billingStatus: tenant.plan.billingStatus,
            trialEndsAt: tenant.plan.trialEndsAt,
            graceEndsAt: tenant.plan.graceEndsAt,
            statusChangedAt: tenant.plan.statusChangedAt,
          }
        : null,
    },
    now,
    settings,
  );
  const statusUi = tenantStatusUi(access);
  const addons = tenant.tenantAddons.map((ta) => ({
    slug: ta.addon.slug,
    name: ta.addon.name,
    pricingModel: ta.addon.pricingModel,
    priceAmount: ta.addon.priceAmount,
    customPrice: ta.customPrice,
  }));
  const price = tenant.plan
    ? serializeTenantMonthly(
        computeTenantMonthly(tenant.plan, addons, packs, activeGuards),
        ufValue,
      )
    : null;
  const monthly = monthlyDisplay(access, price);
  const listRow = serializePlatformTenant({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    companyRut: tenant.companyRut,
    active: tenant.active,
    suspendedAt: tenant.suspendedAt,
    lastActivityAt: tenant.lastActivityAt,
    createdAt: tenant.createdAt,
    plan: tenant.plan,
    addons,
    packs,
    admins: tenant.admins,
    activeGuards,
    now,
    settings,
    ufValue,
  });

  const empresa = Object.fromEntries(empresaRows.map((r) => [r.key, r.value]));
  const owner =
    tenant.admins.find((a) => a.role === 'owner' || a.role === 'admin') ?? tenant.admins[0] ?? null;
  const allowedTransitions = access.missingPlan
    ? []
    : allowedLifecycleActions(access.state).map((action) => ({
        action,
        label: LIFECYCLE_ACTION_LABELS[action],
        requiresReason: lifecycleRequiresReason(action),
      }));

  return NextResponse.json({
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug, active: tenant.active,
      createdAt: tenant.createdAt.toISOString(),
      billingEmail: tenant.billingEmail, supportEmail: tenant.supportEmail,
      notes: tenant.notes,
      legalName: tenant.legalName,
      companyRut: tenant.companyRut,
      fantasyName: tenant.fantasyName,
      hqAddress: tenant.hqAddress,
      dtServiceType: tenant.dtServiceType,
      dtContractStart: tenant.dtContractStart?.toISOString().slice(0, 10) || null,
      dtContractEnd: tenant.dtContractEnd?.toISOString().slice(0, 10) || null,
      dtNoticeEmail: tenant.dtNoticeEmail,
      dtDailyReportEmail: tenant.dtDailyReportEmail,
      suspendedAt: tenant.suspendedAt?.toISOString() || null,
      suspendedReason: tenant.suspendedReason,
      onboardedBy: tenant.onboardedBy,
      lastActivityAt: tenant.lastActivityAt?.toISOString() || null,
      signupSource: tenant.signupSource,
      signupUtm: tenant.signupUtm,
      dpaAcceptedAt: tenant.dpaAcceptedAt?.toISOString() || null,
      dpaAcceptedBy: tenant.dpaAcceptedBy,
      giro: empresa['empresa.giro'] ?? null,
      telefono: empresa['empresa.telefono'] ?? null,
      direccion: empresa['empresa.direccion'] ?? tenant.hqAddress,
    },
    plan: tenant.plan ? {
      plan: tenant.plan.plan, maxGuards: tenant.plan.maxGuards,
      maxAdmins: tenant.plan.maxAdmins, maxStorageMb: tenant.plan.maxStorageMb,
      basePrice: Number(tenant.plan.basePrice),
      pricePerGuard: Number(tenant.plan.pricePerGuard),
      customPricePerGuard: tenant.plan.customPricePerGuard ? Number(tenant.plan.customPricePerGuard) : null,
      customBaseMinimum: tenant.plan.customBaseMinimum ? Number(tenant.plan.customBaseMinimum) : null,
      currency: tenant.plan.currency, billingStatus: tenant.plan.billingStatus,
      trialEndsAt: tenant.plan.trialEndsAt?.toISOString() || null,
      graceEndsAt: tenant.plan.graceEndsAt?.toISOString() || null,
      statusChangedAt: tenant.plan.statusChangedAt?.toISOString() || null,
      statusReason: tenant.plan.statusReason,
      catalogActive: catalogPlan?.active ?? false,
      catalogName: catalogPlan?.name ?? null,
      pricingMode: tenant.plan.customBaseMinimum != null || tenant.plan.customPricePerGuard != null
        ? 'negotiated'
        : 'catalog',
    } : null,
    modules: tenant.modules.map((m) => ({ module: m.module, enabled: m.enabled })),
    admins: tenant.admins.map((a) => ({
      id: a.id, name: a.name, email: a.email, role: a.role, status: a.status,
      lastLoginAt: a.lastLoginAt?.toISOString() || null,
    })),
    owner: owner
      ? { name: owner.name, email: owner.email, role: owner.role }
      : null,
    metrics: { activeGuards, totalGuards, activePuestos, marcaciones30d, documentos30d, rondas30d },
    access: {
      ...serializeAccess(access),
      ...statusUi,
      allowedTransitions,
    },
    monthly,
    pricing: price,
    row: listRow,
    lifecycleTimeline: lifecycleLogs.map((l) => ({
      id: l.id,
      action: l.action,
      actorType: l.actorType,
      actorEmail: l.actorEmail,
      createdAt: l.createdAt.toISOString(),
      after: l.after,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'admin' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    'name', 'billingEmail', 'supportEmail', 'notes', 'active',
    'legalName', 'companyRut', 'fantasyName', 'hqAddress', 'dtServiceType',
    'dtContractStart', 'dtContractEnd', 'dtNoticeEmail', 'dtDailyReportEmail',
  ];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      if (field === 'dtContractStart' || field === 'dtContractEnd') {
        data[field] = body[field] ? new Date(body[field]) : null;
      } else {
        data[field] = body[field];
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  await prisma.tenant.update({ where: { id }, data });

  const { logPlatformAction, platformActor } = await import('@/lib/platform/audit');
  await logPlatformAction({
    ...platformActor(ctx),
    action: 'tenant.update',
    tenantId: id,
    targetType: 'Tenant',
    targetId: id,
    after: data as Record<string, unknown>,
    request,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'owner' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;

  let body: { confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body debe ser JSON con { confirmation: '<slug>' }" },
      { status: 400 },
    );
  }

  if (!body.confirmation) {
    return NextResponse.json(
      { error: 'Falta confirmation en el body' },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  if (body.confirmation.trim() !== tenant.slug) {
    return NextResponse.json(
      {
        error: `Confirmation inválida. Esperado: "${tenant.slug}", recibido: "${body.confirmation}"`,
      },
      { status: 400 },
    );
  }

  if (PROTECTED_SLUGS.has(tenant.slug)) {
    return NextResponse.json(
      {
        error: `El tenant "${tenant.slug}" está protegido y no puede eliminarse desde la UI. Si realmente necesitas borrarlo, hazlo manualmente vía Prisma Studio o SQL.`,
      },
      { status: 403 },
    );
  }

  try {
    const result = await deleteTenant(id);

    await logAudit({
      action: 'DELETE',
      entity: 'Tenant',
      entityId: tenant.id,
      tenantId: null,
      userEmail: ctx.email,
      details: {
        slug: result.tenantSlug,
        name: result.tenantName,
        rowsDeleted: result.rowsDeleted,
      },
      request,
    });

    const { logPlatformAction, platformActor } = await import('@/lib/platform/audit');
    await logPlatformAction({
      ...platformActor(ctx),
      action: 'tenant.delete',
      targetType: 'Tenant',
      targetId: tenant.id,
      after: { slug: result.tenantSlug, name: result.tenantName, rowsDeleted: result.rowsDeleted },
      request,
    });

    return NextResponse.json({
      success: true,
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      rowsDeleted: result.rowsDeleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al eliminar tenant';
    console.error('[DELETE /api/platform/tenants/:id] failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
