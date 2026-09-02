import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { computeTenantMonthly, serializeTenantMonthly } from "@/lib/platform/pricing";
import { getUfValue } from "@/lib/uf";
import { getLifecycleSettings } from "@/lib/platform/settings";
import { deriveTenantAccess } from "@/lib/platform/tenant-lifecycle";
import { monthlyDisplay, tenantStatusUi } from "@/lib/platform/status-ui";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";

function parseMonth(raw: string | null): { year: number; month: number; label: string } {
  const now = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    return { year: y, month: m, label: raw };
  }
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return { year: y, month: m, label: `${y}-${String(m).padStart(2, "0")}` };
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { label } = parseMonth(request.nextUrl.searchParams.get("month"));
  const [tenants, packs, ufValue, settings] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        plan: true,
        tenantAddons: { where: { enabled: true }, include: { addon: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
    getLifecycleSettings(),
  ]);

  const guardCounts = tenants.length
    ? await prisma.opsGuardia.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenants.map((t) => t.id) }, status: "active" },
        _count: { id: true },
      })
    : [];
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));
  const now = new Date();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Facturación ${label}`);
  ws.addRow([
    "Empresa",
    "Slug",
    "Estado",
    "Plan",
    "Guardias",
    "Plan UF",
    "Add-ons UF",
    "Descuento pack UF",
    "Total UF",
    "Total CLP",
    "Completo",
  ]);

  for (const t of tenants) {
    const guards = guardMap.get(t.id) || 0;
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
    ws.addRow([
      t.name,
      t.slug,
      status.statusLabel,
      t.plan?.plan ?? "",
      guards,
      monthly.kind === "trial" || monthly.kind === "exempt" ? "" : (price?.planPrice ?? ""),
      monthly.kind === "trial" || monthly.kind === "exempt" ? "" : (price?.addonsTotal ?? ""),
      price?.packDiscount ?? "",
      monthly.kind === "amount" ? monthly.total : monthly.text,
      monthly.clpTotal ?? "",
      price?.complete ? "sí" : "no",
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  await logPlatformAction({
    ...platformActor(ctx),
    action: "billing.export",
    targetType: "Billing",
    after: { month: label, rows: tenants.length },
    request,
  });

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="facturacion-${label}.xlsx"`,
    },
  });
}
