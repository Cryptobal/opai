import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { computeTenantMonthly, serializeTenantMonthly } from "@/lib/platform/pricing";
import { getUfValue } from "@/lib/uf";
import { getLifecycleSettings } from "@/lib/platform/settings";
import { deriveTenantAccess } from "@/lib/platform/tenant-lifecycle";
import { monthlyDisplay, tenantStatusUi, tallyStatusCounts } from "@/lib/platform/status-ui";

function parseMonth(raw: string | null): { label: string; start: Date; end: Date } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (raw === "prev") {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  } else if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { label, start, end };
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const { label } = parseMonth(request.nextUrl.searchParams.get("month"));
  const now = new Date();
  const [tenants, packs, ufValue, settings] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        plan: true,
        tenantAddons: {
          where: { enabled: true },
          include: { addon: true },
        },
      },
      orderBy: { name: "asc" },
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

  let mrr = 0;
  let totalGuards = 0;
  let paying = 0;
  let pendingPrice = 0;

  const billingTenants = tenants.map((t) => {
    const guards = guardMap.get(t.id) || 0;
    totalGuards += guards;
    const access = deriveTenantAccess(
      {
        tenantId: t.id,
        slug: t.slug,
        active: t.active,
        suspendedAt: t.suspendedAt,
        plan: t.plan
          ? {
              billingStatus: t.plan.billingStatus,
              trialEndsAt: t.plan.trialEndsAt,
              graceEndsAt: t.plan.graceEndsAt,
              statusChangedAt: t.plan.statusChangedAt,
            }
          : null,
      },
      now,
      settings,
    );
    const price = t.plan
      ? serializeTenantMonthly(
          computeTenantMonthly(
            t.plan,
            t.tenantAddons.map((ta) => ({
              slug: ta.addon.slug,
              name: ta.addon.name,
              pricingModel: ta.addon.pricingModel,
              priceAmount: ta.addon.priceAmount,
              customPrice: ta.customPrice,
            })),
            packs,
            guards,
          ),
          ufValue,
        )
      : null;
    const monthly = monthlyDisplay(access, price);
    const status = tenantStatusUi(access);
    if (price?.countsTowardMrr) {
      mrr += price.total;
      paying += 1;
    }
    if (!price?.complete && access.state === "active") pendingPrice += 1;

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || null,
      billingStatus: t.plan?.billingStatus || "trial",
      lifecycleState: access.state,
      exempt: access.exempt,
      statusLabel: status.statusLabel,
      statusVariant: status.statusVariant,
      activeGuards: guards,
      planPrice: price?.planPrice ?? 0,
      addons: price?.breakdown.addonLines.map((l) => ({ name: l.name, price: l.amount })) ?? [],
      addonsTotal: price?.addonsTotal ?? 0,
      packDiscount: price?.packDiscount ?? 0,
      monthlyTotal: price?.total ?? 0,
      monthly,
      currency: price?.currency ?? "UF",
      complete: price?.complete ?? true,
      clpTotal: price?.clpTotal ?? null,
    };
  });

  const mrrUf = Math.round(mrr * 100) / 100;

  return NextResponse.json({
    month: label,
    tenants: billingTenants,
    counts: tallyStatusCounts(billingTenants),
    totals: {
      mrr: mrrUf,
      mrrUf,
      mrrClp: ufValue != null ? Math.round(mrrUf * ufValue) : null,
      currency: "UF",
      totalGuards,
      activeTenants: tenants.filter((t) => t.active).length,
      paying,
      pendingPrice,
    },
  });
}
