import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { deleteTenant } from '@/lib/tenant-deletion';
import { logAudit } from '@/lib/audit';

// Tenants protegidos — no se pueden borrar desde la UI bajo ninguna circunstancia.
const PROTECTED_SLUGS = new Set<string>(['gard']);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

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
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeGuards, totalGuards, marcaciones30d, documentos30d, rondas30d] =
    await Promise.all([
      prisma.opsGuardia.count({ where: { tenantId: id, status: 'active' } }),
      prisma.opsGuardia.count({ where: { tenantId: id } }),
      prisma.opsMarcacion.count({ where: { tenantId: id, timestamp: { gte: thirtyDaysAgo } } }),
      prisma.document.count({ where: { tenantId: id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.opsRondaEjecucion.count({ where: { tenantId: id, startedAt: { gte: thirtyDaysAgo } } }),
    ]);

  const activePuestos = await prisma.opsPuestoOperativo.count({
    where: { tenantId: id, active: true },
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug, active: tenant.active,
      createdAt: tenant.createdAt.toISOString(),
      billingEmail: tenant.billingEmail, supportEmail: tenant.supportEmail,
      notes: tenant.notes,
      suspendedAt: tenant.suspendedAt?.toISOString() || null,
      suspendedReason: tenant.suspendedReason,
      onboardedBy: tenant.onboardedBy,
      lastActivityAt: tenant.lastActivityAt?.toISOString() || null,
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
    } : null,
    modules: tenant.modules.map((m) => ({ module: m.module, enabled: m.enabled })),
    admins: tenant.admins.map((a) => ({
      id: a.id, name: a.name, email: a.email, role: a.role, status: a.status,
      lastLoginAt: a.lastLoginAt?.toISOString() || null,
    })),
    metrics: { activeGuards, totalGuards, activePuestos, marcaciones30d, documentos30d, rondas30d },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const allowedFields = ['name', 'billingEmail', 'supportEmail', 'notes', 'active'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) data[field] = body[field];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  await prisma.tenant.update({ where: { id }, data });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

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
