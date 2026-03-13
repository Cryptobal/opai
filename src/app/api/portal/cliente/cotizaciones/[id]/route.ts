import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { id } = await params;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
    include: {
      parameters: {
        select: {
          salePriceMonthly: true,
          marginPct: true,
          financialRatePct: true,
          policyRatePct: true,
          policyContractMonths: true,
          policyContractPct: true,
          contractMonths: true,
          monthlyHoursStandard: true,
        },
      },
      proposalTemplate: {
        select: { id: true, name: true, slug: true, sections: true },
      },
      positions: {
        select: {
          id: true,
          customName: true,
          numGuards: true,
          numPuestos: true,
          startTime: true,
          endTime: true,
          weekdays: true,
          monthlyPositionCost: true,
          baseSalary: true,
          payrollSnapshot: true,
        },
        orderBy: { createdAt: "asc" },
      },
      additionalLines: {
        select: {
          id: true, nombre: true, descripcion: true, precio: true,
          orden: true, tipo: true, recurrencia: true, cantidad: true, marginPct: true,
        },
        orderBy: { orden: "asc" },
      },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, size: true, publicUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currency = (quote.currency || "CLP") as string;
  const ufValue = currency === "UF" ? await getUfValue() : 0;
  const convertCost = (clp: number) =>
    currency === "UF" && ufValue > 0 ? clpToUf(clp, ufValue) : clp;

  let proposalLink: string | null = null;
  try {
    const presentation = await prisma.presentation.findFirst({
      where: { quoteId: id, status: { not: "draft" } },
      select: { uniqueId: true },
      orderBy: { createdAt: "desc" },
    });
    if (presentation) {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
      proposalLink = `${siteUrl}/p/${presentation.uniqueId}`;
    }
  } catch {}
  if (!proposalLink && quote.dealId) {
    try {
      const deal = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { proposalLink: true },
      });
      proposalLink = deal?.proposalLink ?? null;
    } catch {}
  }

  /* ── Compute costs ── */
  let salePriceClp = quote.parameters?.salePriceMonthly != null
    ? Number(quote.parameters.salePriceMonthly)
    : 0;

  let costSummary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    costSummary = await computeCpqQuoteCosts(id);
  } catch {}

  if (salePriceClp <= 0 && costSummary) {
    const marginPct = Number(quote.parameters?.marginPct ?? 13) / 100;
    const costsBase =
      costSummary.monthlyPositions +
      (costSummary.monthlyHolidayAdjustment ?? 0) +
      (costSummary.monthlyUniforms ?? 0) +
      (costSummary.monthlyExams ?? 0) +
      (costSummary.monthlyMeals ?? 0) +
      (costSummary.monthlyVehicles ?? 0) +
      (costSummary.monthlyInfrastructure ?? 0) +
      (costSummary.monthlyCostItems ?? 0);
    const bwm = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;
    salePriceClp = bwm + (costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0);
  }
  if (salePriceClp <= 0) {
    salePriceClp = quote.monthlyCost?.toNumber() ?? 0;
  }

  const additionalLinesTotal = quote.additionalLines.reduce(
    (s, l) => s + Number(l.precio || 0),
    0
  );
  const rawMonthly = salePriceClp + additionalLinesTotal;

  /* ── Assign sale price to each position ── */
  const positionCosts = quote.positions.map((p) => Number(p.monthlyPositionCost ?? 0));
  const totalPositionCosts = positionCosts.reduce((s, c) => s + c, 0);
  const fallbackProportion = quote.positions.length > 0 ? 1 / quote.positions.length : 0;

  const positionsWithPrice = quote.positions.map((p, i) => {
    const costClp = Number(p.monthlyPositionCost ?? 0);
    const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallbackProportion;
    const allocatedSaleClp = salePriceClp * proportion;
    return {
      ...p,
      monthlyPositionCost: convertCost(costClp),
      displayPrice: convertCost(allocatedSaleClp),
    };
  });

  /* ── Build cost breakdown ── */
  let costBreakdown: QuoteBreakdownData | undefined;
  try {
    if (costSummary) {
      const marginPct = Number(quote.parameters?.marginPct ?? 13);
      const financialRatePct = Number(quote.parameters?.financialRatePct ?? 2.5);
      const policyRatePct = Number(quote.parameters?.policyRatePct ?? 0);
      const monthlyHoursStandard = Number(quote.parameters?.monthlyHoursStandard ?? 180);

      const subtotalBase =
        costSummary.monthlyPositions +
        costSummary.monthlyHolidayAdjustment +
        costSummary.monthlyUniforms +
        costSummary.monthlyExams +
        costSummary.monthlyMeals +
        costSummary.monthlyVehicles +
        costSummary.monthlyInfrastructure +
        costSummary.monthlyCostItems;

      const marginAmount = salePriceClp - subtotalBase - costSummary.monthlyFinancial - costSummary.monthlyPolicy;

      /* ── Cost category breakdown (equipment / transport / systems) ── */
      const costItems = await prisma.cpqQuoteCostItem.findMany({
        where: { quoteId: id },
        include: { catalogItem: true },
      });
      const totalGuards = costSummary.totalGuards;
      const normalizeUnit = (value: number, unit?: string | null) => {
        if (!unit) return value;
        const n = unit.toLowerCase();
        if (n.includes("año") || n.includes("year")) return value / 12;
        if (n.includes("semestre") || n.includes("semester")) return value / 6;
        return value;
      };
      const sumByType = (types: string[]) =>
        costItems.reduce((sum, item) => {
          if (!item.isEnabled) return sum;
          const cat = item.catalogItem;
          const itemType = item.customType ?? cat?.type;
          if (!itemType || !types.includes(itemType)) return sum;
          const base = Number(cat?.basePrice || 0);
          const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
          const unitPrice = normalizeUnit(override ?? base, cat?.unit);
          const quantity = Number(item.quantity ?? 1);
          if (item.calcMode === "per_guard") return sum + unitPrice * quantity * totalGuards;
          return sum + unitPrice * quantity;
        }, 0);

      const equipment = sumByType(["phone", "radio", "flashlight"]);
      const transport = sumByType(["transport"]);
      const systems = sumByType(["system"]);

      /* ── Per-position breakdown ── */
      const positionItems: PositionBreakdownItem[] = quote.positions.map((pos) => {
        const snap = pos.payrollSnapshot as Record<string, unknown> | null;
        const bd = (snap?.breakdown ?? {}) as Record<string, unknown>;
        const costClp = Number(pos.monthlyPositionCost ?? 0);
        const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallbackProportion;
        const positionSaleClp = salePriceClp * proportion;
        const totalGuardsInPos = (pos.numGuards ?? 1) * (pos.numPuestos ?? 1);

        const getNum = (key: string) => Number((bd as Record<string, unknown>)[key] ?? 0) * totalGuardsInPos;
        const getNestedNum = (key: string, sub: string) => {
          const val = bd[key] as Record<string, unknown> | undefined;
          return Number(val?.[sub] ?? 0) * totalGuardsInPos;
        };

        const baseSalary = getNum("base_salary") || (Number(pos.baseSalary ?? 0) * totalGuardsInPos);
        const gratification = getNum("gratification");
        const totalImponible = getNum("total_taxable_income") || (baseSalary + gratification);
        const sisEmployer = getNum("sis_employer");
        const afcEmployer = getNestedNum("afc_employer", "total");
        const mutualEmployer = getNestedNum("work_injury_employer", "amount");
        const vacationProvision = getNum("vacation_provision");
        const severanceProvision = getNum("severance_provision");

        const hourlyRateSale =
          totalGuardsInPos > 0 && monthlyHoursStandard > 0
            ? positionSaleClp / (totalGuardsInPos * monthlyHoursStandard)
            : 0;

        return {
          id: pos.id,
          name: pos.customName ?? "Puesto",
          numGuards: pos.numGuards ?? 1,
          numPuestos: pos.numPuestos ?? 1,
          totalGuardsInPosition: totalGuardsInPos,
          baseSalary,
          gratification,
          totalImponible,
          sisEmployer,
          afcEmployer,
          mutualEmployer,
          vacationProvision,
          severanceProvision,
          totalLaborCost: costClp,
          salePrice: positionSaleClp,
          hourlyRateSale,
        };
      });

      costBreakdown = {
        positions: positionItems,
        totalLaborCost: costSummary.monthlyPositions,
        holidayAdjustment: costSummary.monthlyHolidayAdjustment,
        uniforms: costSummary.monthlyUniforms,
        exams: costSummary.monthlyExams,
        meals: costSummary.monthlyMeals,
        vehicles: costSummary.monthlyVehicles,
        infrastructure: costSummary.monthlyInfrastructure,
        equipment,
        transport,
        systems,
        subtotalBase,
        marginPct,
        marginAmount,
        financial: costSummary.monthlyFinancial,
        financialRatePct,
        policy: costSummary.monthlyPolicy,
        policyRatePct,
        totalSalePrice: salePriceClp,
        additionalLines: additionalLinesTotal,
        grandTotal: rawMonthly,
        monthlyHoursStandard,
        currency,
        ufValue: ufValue > 0 ? ufValue : undefined,
      };
    }
  } catch {
    // Non-critical — return quote without breakdown
  }

  /* ── Build costs by category for "Detailed" portal view ── */
  let costsByCategory: Array<{ category: string; slug: string; type: string; items: Array<{ name: string; value: number }>; subtotal: number }> | undefined;
  try {
    if (costSummary) {
      const costItems = await prisma.cpqQuoteCostItem.findMany({
        where: { quoteId: id, isEnabled: true },
        include: { catalogItem: true },
      });
      const categories = await prisma.cpqCostCategory.findMany({
        where: { active: true, OR: [{ tenantId: session.tenantId }, { tenantId: null }] },
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
      });
      const catMap = new Map(categories.map((c) => [c.slug, c]));

      const grouped = new Map<string, { category: string; slug: string; type: string; items: Array<{ name: string; value: number }>; subtotal: number }>();
      for (const item of costItems) {
        const cat = item.catalogItem;
        if (!cat) continue;
        const catSlug = (cat as Record<string, unknown>).type as string ?? "other";
        const catInfo = catMap.get(catSlug);
        if (!grouped.has(catSlug)) {
          grouped.set(catSlug, {
            category: catInfo?.name ?? catSlug,
            slug: catSlug,
            type: catInfo?.type ?? "indirect",
            items: [],
            subtotal: 0,
          });
        }
        const base = Number(cat.basePrice || 0);
        const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
        const unitPrice = override ?? base;
        const qty = Number(item.quantity ?? 1);
        const totalGuards = costSummary.totalGuards;
        const val = item.calcMode === "per_guard" ? unitPrice * qty * totalGuards : unitPrice * qty;
        const entry = grouped.get(catSlug)!;
        entry.items.push({ name: cat.name, value: convertCost(val) });
        entry.subtotal += val;
      }
      for (const e of grouped.values()) e.subtotal = convertCost(e.subtotal);
      costsByCategory = Array.from(grouped.values()).filter((g) => g.items.length > 0);
    }
  } catch {}

  const templateSections = (quote.proposalTemplate?.sections ?? null) as Record<string, boolean> | null;

  return NextResponse.json({
    success: true,
    data: {
      ...quote,
      monthlyCost: convertCost(rawMonthly),
      proposalLink,
      positions: positionsWithPrice,
      additionalLines: quote.additionalLines.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        descripcion: l.descripcion,
        precio: convertCost(Number(l.precio) || 0),
        orden: l.orden,
        tipo: l.tipo,
        recurrencia: l.recurrencia,
        cantidad: l.cantidad,
      })),
      attachments: quote.attachments?.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        publicUrl: a.publicUrl,
      })) ?? [],
      costBreakdown,
      templateSlug: quote.proposalTemplate?.slug ?? "standard",
      templateSections,
      costsByCategory,
    },
  });
}
