import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { provisionTenant } from "@/lib/tenant-provisioning";
import { getLifecycleSettings } from "@/lib/platform/settings";
import { getUfValue } from "@/lib/uf";
import { tenantSearchWhere } from "@/lib/platform/tenant-search";
import {
  isStatusFilter,
  matchesStatusFilter,
  tallyStatusCounts,
} from "@/lib/platform/status-ui";
import {
  serializePlatformTenant,
  sortPlatformTenantRows,
} from "@/lib/platform/tenant-row";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status = isStatusFilter(statusParam) ? statusParam : "all";
  const planFilter = searchParams.get("plan")?.trim() || "";
  const sort = searchParams.get("sort") || "createdAt";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

  const where: Prisma.TenantWhereInput = {
    ...tenantSearchWhere(q),
  };
  if (planFilter) {
    where.plan = { plan: planFilter };
  }

  const [tenants, packs, ufValue, settings] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        admins: {
          select: { id: true, lastLoginAt: true },
          where: { status: "active" },
        },
        tenantAddons: {
          where: { enabled: true },
          include: { addon: true },
        },
      },
    }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
    getLifecycleSettings(),
  ]);

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = tenantIds.length
    ? await prisma.opsGuardia.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, status: "active" },
        _count: { id: true },
      })
    : [];
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));
  const now = new Date();

  const allRows = tenants.map((t) =>
    serializePlatformTenant({
      id: t.id,
      name: t.name,
      slug: t.slug,
      companyRut: t.companyRut,
      active: t.active,
      suspendedAt: t.suspendedAt,
      lastActivityAt: t.lastActivityAt,
      createdAt: t.createdAt,
      plan: t.plan,
      addons: t.tenantAddons.map((ta) => ({
        slug: ta.addon.slug,
        name: ta.addon.name,
        pricingModel: ta.addon.pricingModel,
        priceAmount: ta.addon.priceAmount,
        customPrice: ta.customPrice,
      })),
      packs,
      admins: t.admins,
      activeGuards: guardMap.get(t.id) || 0,
      now,
      settings,
      ufValue,
    }),
  );

  const counts = tallyStatusCounts(allRows);
  const filtered = allRows.filter((row) =>
    matchesStatusFilter(row.lifecycleState, row.exempt, status),
  );
  const sorted = sortPlatformTenantRows(filtered, sort, order);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageSafe = Math.min(page, pages);
  const slice = sorted.slice((pageSafe - 1) * limit, pageSafe * limit);

  return NextResponse.json({
    tenants: slice,
    total,
    page: pageSafe,
    pages,
    limit,
    counts,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "admin" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  try {
    const body = await request.json();
    const { name, slug, companyRut, ownerName, ownerEmail, ownerPassword, plan, trialDays } = body;

    if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword || !plan) {
      return NextResponse.json(
        { error: "Campos requeridos: name, slug, ownerName, ownerEmail, ownerPassword, plan" },
        { status: 400 },
      );
    }

    const result = await provisionTenant({
      name,
      slug,
      companyRut,
      ownerName,
      ownerEmail,
      ownerPassword,
      plan,
      trialDays,
    });

    await prisma.tenant.update({
      where: { id: result.tenant.id },
      data: { onboardedBy: ctx.email },
    });

    await logPlatformAction({
      ...platformActor(ctx),
      action: "tenant.create",
      tenantId: result.tenant.id,
      targetType: "Tenant",
      targetId: result.tenant.id,
      after: { slug, plan, name },
      request,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear tenant";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
