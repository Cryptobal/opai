import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { resolveLaborCharges } from "@/lib/cpq/labor-breakdown-fallback";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import { buildEmailUrl } from "@/lib/emails/site-url";

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
    where: {
      id,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
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
          serviceGroupId: true,
          serviceGroup: {
            select: {
              id: true,
              name: true,
              coveragePattern: true,
              iconName: true,
              displayOrder: true,
            },
          },
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
      const tenantRow = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { slug: true },
      });
      proposalLink = buildEmailUrl(`/p/${presentation.uniqueId}`, tenantRow?.slug ?? null);
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
  let costSummary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    costSummary = await computeCpqQuoteCosts(id);
  } catch {}

  let salePriceClp: number;
  let additionalLinesTotal: number;

  if (costSummary) {
    salePriceClp = (costSummary.baseWithMargin ?? 0)
      + (costSummary.monthlyFinancial ?? 0)
      + (costSummary.monthlyPolicy ?? 0);
    additionalLinesTotal = costSummary.additionalLinesTotalWithMargin ?? 0;
  } else {
    salePriceClp = quote.parameters?.salePriceMonthly != null
      ? Number(quote.parameters.salePriceMonthly)
      : (quote.monthlyCost?.toNumber() ?? 0);
    additionalLinesTotal = quote.additionalLines.reduce(
      (s, l) => s + Number(l.precio || 0),
      0
    );
  }

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
      const normalizeUnit = (value: number, unit?: string | null, contractMonths?: number) => {
        if (!unit) return value;
        const n = unit.toLowerCase();
        if (n.includes("contrato") || n.includes("contract")) {
          const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
          return value / months;
        }
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
      const vehicleCostItems = sumByType(["vehicle_rent", "vehicle_fuel", "vehicle_tag"]);
      const infraCostItems = sumByType(["infrastructure", "fuel"]);
      const otherCostItems = sumByType(["other"]);

      /* ── Per-position breakdown ── */
      const positionItems: PositionBreakdownItem[] = quote.positions.map((pos) => {
        const snap = pos.payrollSnapshot as Record<string, unknown> | null;
        const bd = (snap?.breakdown ?? {}) as Record<string, unknown>;
        const costClp = Number(pos.monthlyPositionCost ?? 0);
        const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallbackProportion;
        const positionSaleClp = salePriceClp * proportion;
        const totalGuardsInPos = (pos.numGuards ?? 1) * (pos.numPuestos ?? 1);

        const getNum = (key: string) => Number((bd as Record<string, unknown>)[key] ?? 0) * totalGuardsInPos;

        const baseSalary = getNum("base_salary") || (Number(pos.baseSalary ?? 0) * totalGuardsInPos);
        const charges = resolveLaborCharges({
          baseSalaryTotal: baseSalary,
          totalGuardsInPosition: totalGuardsInPos,
          snapshot: bd,
        });
        const {
          gratification,
          totalImponible,
          sisEmployer,
          afcEmployer,
          mutualEmployer,
          vacationProvision,
          severanceProvision,
        } = charges;

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
          serviceGroupId: pos.serviceGroupId ?? null,
          serviceGroupName: pos.serviceGroup?.name ?? null,
          serviceGroupPattern: pos.serviceGroup?.coveragePattern ?? null,
          serviceGroupOrder: pos.serviceGroup?.displayOrder ?? null,
          serviceGroupIcon: pos.serviceGroup?.iconName ?? null,
        };
      });

      costBreakdown = {
        positions: positionItems,
        totalLaborCost: costSummary.monthlyPositions,
        holidayAdjustment: costSummary.monthlyHolidayAdjustment,
        uniforms: costSummary.monthlyUniforms,
        exams: costSummary.monthlyExams,
        meals: costSummary.monthlyMeals,
        vehicles: costSummary.monthlyVehicles + vehicleCostItems,
        infrastructure: costSummary.monthlyInfrastructure + infraCostItems,
        equipment,
        transport,
        systems,
        other: otherCostItems,
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
  type ResourceItem = { name: string; amount: number; quantity?: number; unit?: string; technicalSpecs?: string | null };
  type ResourceCat = { category: string; categoryType: string; items: ResourceItem[]; subtotal: number };
  let resourceBreakdown: ResourceCat[] | undefined;
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
      const catBySlug = new Map(categories.map((c) => [c.slug, c]));
      const catByType = new Map(categories.map((c) => [c.type, c]));

      const TYPE_DISPLAY: Record<string, string> = {
        phone: "Equipamiento operativo",
        radio: "Equipamiento operativo",
        flashlight: "Equipamiento operativo",
        system: "Sistemas y tecnología",
        transport: "Transporte",
      };

      const grouped = new Map<string, { category: string; slug: string; type: string; items: Array<{ name: string; value: number }>; subtotal: number }>();
      for (const item of costItems) {
        const cat = item.catalogItem;
        if (!cat) continue;
        const itemType = (cat as Record<string, unknown>).type as string ?? "other";
        const catInfo = catBySlug.get(itemType) ?? catByType.get(itemType);
        const displayName = catInfo?.name ?? TYPE_DISPLAY[itemType] ?? itemType;
        if (!grouped.has(itemType)) {
          grouped.set(itemType, {
            category: displayName,
            slug: itemType,
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
        const entry = grouped.get(itemType)!;
        entry.items.push({ name: cat.name, value: convertCost(val) });
        entry.subtotal += val;
      }
      for (const e of grouped.values()) e.subtotal = convertCost(e.subtotal);
      costsByCategory = Array.from(grouped.values()).filter((g) => g.items.length > 0);

      /* ── Resource breakdown with technicalSpecs + uniforms/exams/meals ── */
      const resCats: ResourceCat[] = [];
      const tg = costSummary.totalGuards;
      const contractDur = quote.contractDuration ?? 12;
      const normalizeUnit = (v: number, unit?: string | null) => {
        if (!unit) return v;
        const n = unit.toLowerCase();
        if (n.includes('contrato') || n.includes('contract')) return v / contractDur;
        if (n.includes('año') || n.includes('year')) return v / 12;
        if (n.includes('semestre') || n.includes('semester')) return v / 6;
        return v;
      };

      const [uniforms, exams, dbMeals, dbVehicles, dbInfra] = await Promise.all([
        prisma.cpqQuoteUniformItem.findMany({ where: { quoteId: id, active: true }, include: { catalogItem: true } }),
        prisma.cpqQuoteExamItem.findMany({ where: { quoteId: id, active: true }, include: { catalogItem: true } }),
        prisma.cpqQuoteMeal.findMany({ where: { quoteId: id, isEnabled: true } }),
        prisma.cpqQuoteVehicle.findMany({ where: { quoteId: id, isEnabled: true } }),
        prisma.cpqQuoteInfrastructure.findMany({ where: { quoteId: id, isEnabled: true } }),
      ]);

      if (uniforms.length > 0) {
        const uItems: ResourceItem[] = uniforms.map((u) => {
          const base = Number(u.catalogItem?.basePrice ?? 0);
          const ov = u.unitPriceOverride != null ? Number(u.unitPriceOverride) : null;
          const price = normalizeUnit(ov ?? base, u.catalogItem?.unit);
          const logic = (u as Record<string, unknown>).priceLogic as string ?? u.catalogItem?.priceLogic ?? 'uniform';
          const monthly = logic === 'prorated' ? price * tg : ((price * 3) / 12) * tg;
          return { name: u.catalogItem?.name ?? 'Uniforme', amount: convertCost(monthly), quantity: tg, unit: 'por guardia/mes', technicalSpecs: u.technicalSpecs ?? u.catalogItem?.defaultTechnicalSpecs ?? null };
        });
        resCats.push({ category: 'Uniformes', categoryType: 'direct', items: uItems, subtotal: uItems.reduce((s, i) => s + i.amount, 0) });
      }

      if (exams.length > 0) {
        const freq = Math.max(12 / 4, 3);
        const eItems: ResourceItem[] = exams.map((ex) => {
          const base = Number(ex.catalogItem?.basePrice ?? 0);
          const ov = ex.unitPriceOverride != null ? Number(ex.unitPriceOverride) : null;
          const uPrice = normalizeUnit(ov ?? base, ex.catalogItem?.unit);
          const monthly = tg > 0 ? ((uPrice * freq) / 12) * tg : 0;
          return { name: ex.catalogItem?.name ?? 'Examen', amount: convertCost(monthly), quantity: tg, unit: 'por guardia/mes', technicalSpecs: ex.technicalSpecs ?? ex.catalogItem?.defaultTechnicalSpecs ?? null };
        });
        resCats.push({ category: 'Exámenes Médicos', categoryType: 'direct', items: eItems, subtotal: eItems.reduce((s, i) => s + i.amount, 0) });
      }

      const activeMeals = dbMeals.filter((m) => m.mealsPerDay > 0);
      if (activeMeals.length > 0) {
        const mealCatalog = await prisma.cpqCatalogItem.findMany({ where: { type: 'meal', active: true, OR: [{ tenantId: session.tenantId }, { tenantId: null }] } });
        const mealMap = new Map(mealCatalog.map((m) => [m.name.toLowerCase(), m]));
        const mItems: ResourceItem[] = activeMeals.map((m) => {
          const ci = mealMap.get(m.mealType.toLowerCase());
          const base = Number(ci?.basePrice ?? 0);
          const ov = m.priceOverride != null ? Number(m.priceOverride) : null;
          const price = normalizeUnit(ov ?? base, ci?.unit);
          const monthly = price * m.mealsPerDay * m.daysOfService;
          return { name: m.mealType, amount: convertCost(monthly), quantity: m.mealsPerDay, unit: `${m.mealsPerDay} comidas/día × ${m.daysOfService} días`, technicalSpecs: m.technicalSpecs ?? ci?.defaultTechnicalSpecs ?? null };
        });
        resCats.push({ category: 'Alimentación', categoryType: 'direct', items: mItems, subtotal: mItems.reduce((s, i) => s + i.amount, 0) });
      }

      /* — Vehículos (cpqQuoteVehicle) — */
      if (dbVehicles.length > 0) {
        const safeNum = (v: unknown) => Number(v || 0);
        const vItems: ResourceItem[] = dbVehicles.map((v, vi) => {
          const kmPerDay = safeNum(v.kmPerDay);
          const daysPerMonth = safeNum(v.daysPerMonth);
          const kmPerLiter = safeNum(v.kmPerLiter);
          const liters = kmPerLiter > 0 ? (kmPerDay * daysPerMonth) / kmPerLiter : 0;
          const fuelCost = liters * safeNum(v.fuelPrice);
          const vehicleMonthly = safeNum(v.rentMonthly) + safeNum(v.maintenanceMonthly) + fuelCost;
          const total = vehicleMonthly * v.vehiclesCount;
          const specs = [
            safeNum(v.rentMonthly) > 0 ? `Arriendo: $${Math.round(safeNum(v.rentMonthly)).toLocaleString('es-CL')}/mes` : null,
            safeNum(v.maintenanceMonthly) > 0 ? `Mantención: $${Math.round(safeNum(v.maintenanceMonthly)).toLocaleString('es-CL')}/mes` : null,
            kmPerDay > 0 ? `${kmPerDay} km/día · ${daysPerMonth} días/mes` : null,
            fuelCost > 0 ? `Combustible: $${Math.round(fuelCost).toLocaleString('es-CL')}/mes` : null,
          ].filter(Boolean).join(' · ');
          return {
            name: `Vehículo ${vi + 1} (×${v.vehiclesCount})`,
            amount: convertCost(total),
            quantity: v.vehiclesCount,
            unit: `${v.vehiclesCount} unidad(es)`,
            technicalSpecs: specs || null,
          };
        });
        resCats.push({ category: 'Vehículos', categoryType: 'indirect', items: vItems, subtotal: vItems.reduce((s, i) => s + i.amount, 0) });
      }

      /* — Infraestructura (cpqQuoteInfrastructure) — */
      if (dbInfra.length > 0) {
        const safeNum = (v: unknown) => Number(v || 0);
        const iItems: ResourceItem[] = dbInfra.map((inf) => {
          const base = safeNum(inf.rentMonthly);
          let fuelCost = 0;
          if (inf.hasFuel) {
            const liters = safeNum(inf.fuelLitersPerHour) * safeNum(inf.fuelHoursPerDay) * safeNum(inf.fuelDaysPerMonth);
            fuelCost = liters * safeNum(inf.fuelPrice);
          }
          const total = (base + fuelCost) * inf.quantity;
          const specs = [
            base > 0 ? `Arriendo: $${Math.round(base).toLocaleString('es-CL')}/mes` : null,
            fuelCost > 0 ? `Combustible: $${Math.round(fuelCost).toLocaleString('es-CL')}/mes` : null,
          ].filter(Boolean).join(' · ');
          return {
            name: inf.itemType || 'Infraestructura',
            amount: convertCost(total),
            quantity: inf.quantity,
            unit: `${inf.quantity} unidad(es)`,
            technicalSpecs: specs || null,
          };
        });
        resCats.push({ category: 'Infraestructura', categoryType: 'indirect', items: iItems, subtotal: iItems.reduce((s, i) => s + i.amount, 0) });
      }

      /* — Cost items agrupados por tipo (cpqQuoteCostItem) — */
      const excludeTypes = new Set(['uniform', 'exam', 'meal', 'financial', 'policy']);
      const TYPE_VEHICLE: Record<string, string> = { vehicle_rent: 'Vehículos', vehicle_fuel: 'Vehículos', vehicle_tag: 'Vehículos' };
      for (const item of costItems) {
        const cat = item.catalogItem;
        if (!cat) continue;
        const itemType = (cat as Record<string, unknown>).type as string ?? "other";
        if (excludeTypes.has(itemType)) continue;
        const catInfo = catBySlug.get(itemType) ?? catByType.get(itemType);
        const displayName = TYPE_VEHICLE[itemType] ?? catInfo?.name ?? TYPE_DISPLAY[itemType] ?? itemType;
        let resCat = resCats.find((c) => c.category === displayName);
        if (!resCat) {
          resCat = { category: displayName, categoryType: catInfo?.type ?? 'indirect', items: [], subtotal: 0 };
          resCats.push(resCat);
        }
        const base = Number(cat.basePrice || 0);
        const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
        const unitPrice = override ?? base;
        const qty = Number(item.quantity ?? 1);
        const val = item.calcMode === "per_guard" ? unitPrice * qty * tg : unitPrice * qty;
        resCat.items.push({
          name: (item as Record<string, unknown>).customName as string ?? cat.name,
          amount: convertCost(val),
          technicalSpecs: item.technicalSpecs ?? cat.defaultTechnicalSpecs ?? null,
        });
        resCat.subtotal += convertCost(val);
      }

      resourceBreakdown = resCats.filter((c) => c.items.length > 0);
    }
  } catch {}

  const templateSections = (quote.proposalTemplate?.sections ?? null) as Record<string, boolean> | null;

  /* ── Build labor breakdown for portal ── */
  let laborBreakdown: { totalGuardias: number; totalMensual: number; positionDetails: Array<{
    name: string; totalGuardsInPosition: number; baseSalary: number; gratification: number;
    totalImponible: number; sisEmployer: number; afcEmployer: number; mutualEmployer: number;
    vacationProvision: number; severanceProvision: number; totalLaborCost: number;
  }> } | undefined;
  if (costBreakdown && costBreakdown.positions.length > 0) {
    const posGuards = costBreakdown.positions.reduce((s, p) => s + p.totalGuardsInPosition, 0);
    laborBreakdown = {
      totalGuardias: posGuards,
      totalMensual: costBreakdown.totalLaborCost,
      positionDetails: costBreakdown.positions.map((p) => ({
        name: p.name,
        totalGuardsInPosition: p.totalGuardsInPosition,
        baseSalary: p.baseSalary,
        gratification: p.gratification,
        totalImponible: p.totalImponible,
        sisEmployer: p.sisEmployer,
        afcEmployer: p.afcEmployer,
        mutualEmployer: p.mutualEmployer,
        vacationProvision: p.vacationProvision,
        severanceProvision: p.severanceProvision,
        totalLaborCost: p.totalLaborCost,
      })),
    };
  }

  /* ── Compliance items ── */
  const complianceItems = [
    "Ley 21.659 — Seguridad Privada",
    "D.S. 594 — Condiciones sanitarias y ambientales",
    "D.L. 3.607 — Vigilantes privados",
    "Ley 16.744 — Seguro contra accidentes del trabajo",
    "Código del Trabajo — Jornada y descansos",
    "D.S. 40 — Prevención de riesgos profesionales",
  ];

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
      resourceBreakdown,
      laborBreakdown,
      complianceItems,
    },
  });
}
