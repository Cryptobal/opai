import { NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { getLifecycleSettings } from "@/lib/platform/settings";
import { getUfValue } from "@/lib/uf";
import { serializePlatformTenant } from "@/lib/platform/tenant-row";
import { tallyStatusCounts } from "@/lib/platform/status-ui";
import { buildDashboardActions } from "@/lib/platform/dashboard-actions";

export async function GET() {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const settings = await getLifecycleSettings();

  const [tenants, packs, ufValue, openUpgradeRequests, upgradeRows] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        plan: true,
        modules: { where: { enabled: true } },
        admins: {
          select: { id: true, lastLoginAt: true },
          where: { status: "active" },
        },
        tenantAddons: {
          where: { enabled: true },
          include: { addon: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
    prisma.upgradeRequest.count({ where: { status: "open" } }),
    prisma.upgradeRequest.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { tenant: { select: { name: true } } },
    }),
  ]);

  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ["tenantId"],
    where: { status: "active" },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  const guardsLastMonth = await prisma.opsGuardia.count({
    where: {
      status: "active",
      hiredAt: { lt: startOfMonth },
    },
  });
  const totalGuardsNow = guardCounts.reduce((sum, g) => sum + g._count.id, 0);

  const activeTenants = tenants.filter((t) => t.active);
  const newThisMonth = tenants.filter((t) => t.active && t.createdAt >= startOfMonth).length;
  const guardsGrowthPct =
    guardsLastMonth > 0
      ? Math.round(((totalGuardsNow - guardsLastMonth) / guardsLastMonth) * 100)
      : 0;

  let estimatedMrr = 0;
  let payingTenants = 0;
  let trialingTenants = 0;
  let graceTenants = 0;
  let expiringTrials = 0;

  const tenantList = tenants.map((t) => {
    const row = serializePlatformTenant({
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
    });
    if (row.countsTowardMrr && row.monthlyTotal != null) {
      estimatedMrr += row.monthlyTotal;
    }
    if (row.lifecycleState === "active" && !row.exempt) payingTenants += 1;
    if (row.lifecycleState === "trialing") trialingTenants += 1;
    if (row.lifecycleState === "trial_expired" || row.lifecycleState === "past_due") {
      graceTenants += 1;
    }
    if (
      row.lifecycleState === "trialing" &&
      row.daysLeft != null &&
      row.daysLeft >= 0 &&
      row.daysLeft <= 7
    ) {
      expiringTrials += 1;
    }
    return row;
  });

  const actions = buildDashboardActions({
    now,
    upgradeRequests: upgradeRows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      requestedPlan: r.requestedPlan,
    })),
    tenants: tenantList.map((r) => ({
      id: r.id,
      name: r.name,
      lifecycleState: r.lifecycleState,
      daysLeft: r.daysLeft,
      activeGuards: r.activeGuards,
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt) : null,
      createdAt: new Date(r.createdAt),
      pricingComplete: r.pricingComplete,
      exempt: r.exempt,
    })),
  });

  const mrrUf = Math.round(estimatedMrr * 100) / 100;

  return NextResponse.json({
    kpis: {
      activeTenants: activeTenants.length,
      activeTenantsGrowth: newThisMonth,
      totalGuards: totalGuardsNow,
      totalGuardsGrowthPct: guardsGrowthPct,
      estimatedMrr: mrrUf,
      estimatedMrrUf: mrrUf,
      estimatedMrrClp: ufValue != null ? Math.round(mrrUf * ufValue) : null,
      currency: "UF",
      expiringTrials,
      payingTenants,
      trialingTenants,
      graceTenants,
      openUpgradeRequests,
    },
    counts: tallyStatusCounts(tenantList),
    actions,
    tenants: tenantList,
  });
}
