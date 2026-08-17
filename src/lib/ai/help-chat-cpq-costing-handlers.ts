/**
 * Handlers CPQ de costeo avanzado para MCP/chat:
 * - meal / vehicle / infrastructure (delegados desde manage_quote_extras)
 * - update_quote_parameters (Financieros)
 *
 * Toda escritura recalcula con recomputeQuoteTotals (misma fuente que la UI).
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { RolePermissions } from "@/lib/permissions";
import {
  hcAiLog,
  hcCanReadQuotes,
  hcCanWriteQuotes,
  hcMapQuoteResolveError,
} from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";
import { recomputeQuoteTotals } from "@/lib/ai/help-chat-cpq-recompute";

type PageCx = HelpChatPageContext | null | undefined;

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}
function numArg(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
function boolArg(o: Record<string, unknown>, k: string): boolean | undefined {
  const v = o[k];
  if (typeof v === "boolean") return v;
  return undefined;
}

export async function listCostingExtras(quoteId: string) {
  const [meals, vehicles, infrastructure] = await Promise.all([
    prisma.cpqQuoteMeal.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
    prisma.cpqQuoteVehicle.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
    prisma.cpqQuoteInfrastructure.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    meal: meals.map((m) => ({
      itemId: m.id,
      mealType: m.mealType,
      mealsPerDay: m.mealsPerDay,
      daysOfService: m.daysOfService,
      priceOverride: m.priceOverride != null ? Number(m.priceOverride) : null,
      isEnabled: m.isEnabled,
      visibility: m.visibility,
    })),
    vehicle: vehicles.map((v) => ({
      itemId: v.id,
      vehiclesCount: v.vehiclesCount,
      rentMonthly: Number(v.rentMonthly),
      kmPerDay: Number(v.kmPerDay),
      daysPerMonth: v.daysPerMonth,
      kmPerLiter: Number(v.kmPerLiter),
      fuelPrice: Number(v.fuelPrice),
      maintenanceMonthly: Number(v.maintenanceMonthly),
      isEnabled: v.isEnabled,
      visibility: v.visibility,
    })),
    infrastructure: infrastructure.map((i) => ({
      itemId: i.id,
      itemType: i.itemType,
      quantity: i.quantity,
      rentMonthly: Number(i.rentMonthly),
      hasFuel: i.hasFuel,
      fuelLitersPerHour: Number(i.fuelLitersPerHour),
      fuelHoursPerDay: Number(i.fuelHoursPerDay),
      fuelDaysPerMonth: i.fuelDaysPerMonth,
      fuelPrice: Number(i.fuelPrice),
      isEnabled: i.isEnabled,
      visibility: i.visibility,
    })),
  };
}

type ValFn = (msg: string, code: string) => Promise<{ ok: false; error: string }>;

/** Mutaciones meal|vehicle|infrastructure. Devuelve null si kind no aplica. */
export async function mutateCostingKind(
  quoteId: string,
  kind: string,
  action: string,
  args: Record<string, unknown>,
  val: ValFn,
): Promise<{ ok: true } | { ok: false; error: string } | null> {
  if (kind === "meal") {
    if (action === "add") {
      const mealType = asStr(args, "mealType") ?? asStr(args, "name");
      if (!mealType) return await val("Indica mealType (ej. 'Almuerzo', 'Cena').", "mealType");
      const mealsPerDay = numArg(args, "mealsPerDay") ?? 0;
      if (mealsPerDay < 0) return await val("mealsPerDay ≥ 0.", "mealsPerDay");
      const daysOfService = numArg(args, "daysOfService") ?? 0;
      if (daysOfService < 0 || daysOfService > 31) {
        return await val("daysOfService ∈ [0, 31].", "daysOfService");
      }
      await prisma.cpqQuoteMeal.create({
        data: {
          quoteId,
          mealType: mealType.slice(0, 100),
          mealsPerDay: Math.round(mealsPerDay),
          daysOfService: Math.round(daysOfService),
          priceOverride: numArg(args, "priceOverride") ?? numArg(args, "unitPrice") ?? null,
          isEnabled: boolArg(args, "isEnabled") ?? true,
          visibility: asStr(args, "visibility") === "hidden" ? "hidden" : "visible",
        },
      });
      return { ok: true };
    }
    const itemId = asStr(args, "itemId");
    if (!itemId) return await val("Indica itemId del meal (action=list).", "itemId");
    const existing = await prisma.cpqQuoteMeal.findFirst({ where: { id: itemId, quoteId } });
    if (!existing) return await val("No encontré esa alimentación en la cotización.", "notfound");
    if (action === "remove") {
      await prisma.cpqQuoteMeal.deleteMany({ where: { id: itemId, quoteId } });
      return { ok: true };
    }
    const data: Prisma.CpqQuoteMealUpdateManyMutationInput = {};
    const mealType = asStr(args, "mealType") ?? asStr(args, "name");
    if (mealType) data.mealType = mealType.slice(0, 100);
    const mealsPerDay = numArg(args, "mealsPerDay");
    if (mealsPerDay != null) {
      if (mealsPerDay < 0) return await val("mealsPerDay ≥ 0.", "mealsPerDay");
      data.mealsPerDay = Math.round(mealsPerDay);
    }
    const daysOfService = numArg(args, "daysOfService");
    if (daysOfService != null) {
      if (daysOfService < 0 || daysOfService > 31) {
        return await val("daysOfService ∈ [0, 31].", "daysOfService");
      }
      data.daysOfService = Math.round(daysOfService);
    }
    if (Object.prototype.hasOwnProperty.call(args, "priceOverride") || Object.prototype.hasOwnProperty.call(args, "unitPrice")) {
      data.priceOverride = numArg(args, "priceOverride") ?? numArg(args, "unitPrice") ?? null;
    }
    const isEnabled = boolArg(args, "isEnabled");
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    const visibility = asStr(args, "visibility");
    if (visibility === "visible" || visibility === "hidden") data.visibility = visibility;
    if (Object.keys(data).length === 0) return await val("Indica al menos un campo a actualizar.", "nofields");
    await prisma.cpqQuoteMeal.updateMany({ where: { id: itemId, quoteId }, data });
    return { ok: true };
  }

  if (kind === "vehicle") {
    if (action === "add") {
      const vehiclesCount = Math.round(numArg(args, "vehiclesCount") ?? 1);
      if (vehiclesCount < 1) return await val("vehiclesCount ≥ 1.", "vehiclesCount");
      const daysPerMonth = Math.round(numArg(args, "daysPerMonth") ?? 0);
      if (daysPerMonth < 0 || daysPerMonth > 31) {
        return await val("daysPerMonth ∈ [0, 31].", "daysPerMonth");
      }
      await prisma.cpqQuoteVehicle.create({
        data: {
          quoteId,
          vehiclesCount,
          rentMonthly: numArg(args, "rentMonthly") ?? 0,
          kmPerDay: numArg(args, "kmPerDay") ?? 0,
          daysPerMonth,
          kmPerLiter: numArg(args, "kmPerLiter") ?? 0,
          fuelPrice: numArg(args, "fuelPrice") ?? 0,
          maintenanceMonthly: numArg(args, "maintenanceMonthly") ?? 0,
          isEnabled: boolArg(args, "isEnabled") ?? true,
          visibility: asStr(args, "visibility") === "hidden" ? "hidden" : "visible",
        },
      });
      return { ok: true };
    }
    const itemId = asStr(args, "itemId");
    if (!itemId) return await val("Indica itemId del vehículo (action=list).", "itemId");
    const existing = await prisma.cpqQuoteVehicle.findFirst({ where: { id: itemId, quoteId } });
    if (!existing) return await val("No encontré ese vehículo en la cotización.", "notfound");
    if (action === "remove") {
      await prisma.cpqQuoteVehicle.deleteMany({ where: { id: itemId, quoteId } });
      return { ok: true };
    }
    const data: Prisma.CpqQuoteVehicleUpdateManyMutationInput = {};
    const vehiclesCount = numArg(args, "vehiclesCount");
    if (vehiclesCount != null) {
      if (vehiclesCount < 1) return await val("vehiclesCount ≥ 1.", "vehiclesCount");
      data.vehiclesCount = Math.round(vehiclesCount);
    }
    for (const k of ["rentMonthly", "kmPerDay", "kmPerLiter", "fuelPrice", "maintenanceMonthly"] as const) {
      const n = numArg(args, k);
      if (n != null) data[k] = n;
    }
    const daysPerMonth = numArg(args, "daysPerMonth");
    if (daysPerMonth != null) {
      if (daysPerMonth < 0 || daysPerMonth > 31) {
        return await val("daysPerMonth ∈ [0, 31].", "daysPerMonth");
      }
      data.daysPerMonth = Math.round(daysPerMonth);
    }
    const isEnabled = boolArg(args, "isEnabled");
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    const visibility = asStr(args, "visibility");
    if (visibility === "visible" || visibility === "hidden") data.visibility = visibility;
    if (Object.keys(data).length === 0) return await val("Indica al menos un campo a actualizar.", "nofields");
    await prisma.cpqQuoteVehicle.updateMany({ where: { id: itemId, quoteId }, data });
    return { ok: true };
  }

  if (kind === "infrastructure") {
    if (action === "add") {
      const itemType = asStr(args, "itemType") ?? asStr(args, "name");
      if (!itemType) return await val("Indica itemType (ej. 'Generador', 'Contenedor').", "itemType");
      const quantity = Math.round(numArg(args, "quantity") ?? 1);
      if (quantity < 1) return await val("quantity ≥ 1.", "quantity");
      const fuelDaysPerMonth = Math.round(numArg(args, "fuelDaysPerMonth") ?? 0);
      if (fuelDaysPerMonth < 0 || fuelDaysPerMonth > 31) {
        return await val("fuelDaysPerMonth ∈ [0, 31].", "fuelDaysPerMonth");
      }
      await prisma.cpqQuoteInfrastructure.create({
        data: {
          quoteId,
          itemType: itemType.slice(0, 100),
          quantity,
          rentMonthly: numArg(args, "rentMonthly") ?? 0,
          hasFuel: boolArg(args, "hasFuel") ?? false,
          fuelLitersPerHour: numArg(args, "fuelLitersPerHour") ?? 0,
          fuelHoursPerDay: numArg(args, "fuelHoursPerDay") ?? 0,
          fuelDaysPerMonth,
          fuelPrice: numArg(args, "fuelPrice") ?? 0,
          isEnabled: boolArg(args, "isEnabled") ?? true,
          visibility: asStr(args, "visibility") === "hidden" ? "hidden" : "visible",
        },
      });
      return { ok: true };
    }
    const itemId = asStr(args, "itemId");
    if (!itemId) return await val("Indica itemId de infraestructura (action=list).", "itemId");
    const existing = await prisma.cpqQuoteInfrastructure.findFirst({ where: { id: itemId, quoteId } });
    if (!existing) return await val("No encontré esa infraestructura en la cotización.", "notfound");
    if (action === "remove") {
      await prisma.cpqQuoteInfrastructure.deleteMany({ where: { id: itemId, quoteId } });
      return { ok: true };
    }
    const data: Prisma.CpqQuoteInfrastructureUpdateManyMutationInput = {};
    const itemType = asStr(args, "itemType") ?? asStr(args, "name");
    if (itemType) data.itemType = itemType.slice(0, 100);
    const quantity = numArg(args, "quantity");
    if (quantity != null) {
      if (quantity < 1) return await val("quantity ≥ 1.", "quantity");
      data.quantity = Math.round(quantity);
    }
    const rentMonthly = numArg(args, "rentMonthly");
    if (rentMonthly != null) data.rentMonthly = rentMonthly;
    const hasFuel = boolArg(args, "hasFuel");
    if (hasFuel !== undefined) data.hasFuel = hasFuel;
    for (const k of ["fuelLitersPerHour", "fuelHoursPerDay", "fuelPrice"] as const) {
      const n = numArg(args, k);
      if (n != null) data[k] = n;
    }
    const fuelDaysPerMonth = numArg(args, "fuelDaysPerMonth");
    if (fuelDaysPerMonth != null) {
      if (fuelDaysPerMonth < 0 || fuelDaysPerMonth > 31) {
        return await val("fuelDaysPerMonth ∈ [0, 31].", "fuelDaysPerMonth");
      }
      data.fuelDaysPerMonth = Math.round(fuelDaysPerMonth);
    }
    const isEnabled = boolArg(args, "isEnabled");
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    const visibility = asStr(args, "visibility");
    if (visibility === "visible" || visibility === "hidden") data.visibility = visibility;
    if (Object.keys(data).length === 0) return await val("Indica al menos un campo a actualizar.", "nofields");
    await prisma.cpqQuoteInfrastructure.updateMany({ where: { id: itemId, quoteId }, data });
    return { ok: true };
  }

  return null;
}

/**
 * Patch parcial de CpqQuoteParameters (pestaña Financieros).
 * Margen: rechazado explícitamente → usar update_quote_margin.
 * Enums reales del motor: financialBaseMode auto|manual, policyAmountMode pct|fija,
 * liabilityMode premium|rate.
 */
export async function aiTool_update_quote_parameters(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  const TOOL = "update_quote_parameters";
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para editar cotizaciones." };
  }

  const val = async (msg: string, code: string) => {
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "validation_error",
      errorMessage: code,
      startedAt: t0,
    });
    return { ok: false as const, error: msg };
  };

  try {
    if (
      Object.prototype.hasOwnProperty.call(args, "marginPct") ||
      Object.prototype.hasOwnProperty.call(args, "marginMode")
    ) {
      return await val(
        "Para cambiar el margen usa update_quote_margin (única fuente de verdad). update_quote_parameters no acepta marginPct/marginMode.",
        "margin",
      );
    }

    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const before = await prisma.cpqQuote.findFirst({
      where: { id: quote.id, tenantId },
      select: { monthlyCost: true },
    });

    const data: Prisma.CpqQuoteParametersUncheckedUpdateInput = {};
    const warnings: string[] = [];

    const intField = (
      key: string,
      min: number,
      max: number,
    ): number | undefined => {
      const n = numArg(args, key);
      if (n == null) return undefined;
      const r = Math.round(n);
      if (r < min || r > max) throw new Error(`RANGE:${key}`);
      return r;
    };
    const pctField = (key: string, max = 100): number | undefined => {
      const n = numArg(args, key);
      if (n == null) return undefined;
      if (n < 0 || n > max) throw new Error(`RANGE:${key}`);
      return n;
    };

    try {
      const monthlyHoursStandard = intField("monthlyHoursStandard", 1, 744);
      if (monthlyHoursStandard != null) data.monthlyHoursStandard = monthlyHoursStandard;
      const avgStayMonths = intField("avgStayMonths", 1, 120);
      if (avgStayMonths != null) data.avgStayMonths = avgStayMonths;
      const uniformChangesPerYear = intField("uniformChangesPerYear", 0, 24);
      if (uniformChangesPerYear != null) data.uniformChangesPerYear = uniformChangesPerYear;
      const contractMonths = intField("contractMonths", 1, 120);
      if (contractMonths != null) data.contractMonths = contractMonths;
      const policyContractMonths = intField("policyContractMonths", 1, 120);
      if (policyContractMonths != null) data.policyContractMonths = policyContractMonths;

      const financialEnabled = boolArg(args, "financialEnabled");
      if (financialEnabled !== undefined) data.financialEnabled = financialEnabled;
      const financialRatePct = pctField("financialRatePct", 20);
      if (financialRatePct != null) data.financialRatePct = financialRatePct;
      const financialBaseMode = asStr(args, "financialBaseMode");
      if (financialBaseMode) {
        if (financialBaseMode !== "auto" && financialBaseMode !== "manual") {
          return await val("financialBaseMode debe ser 'auto' o 'manual'.", "financialBaseMode");
        }
        data.financialBaseMode = financialBaseMode;
      }

      const policyEnabled = boolArg(args, "policyEnabled");
      if (policyEnabled !== undefined) data.policyEnabled = policyEnabled;
      const policyAmountMode = asStr(args, "policyAmountMode");
      if (policyAmountMode) {
        // Motor: pct | fija (no "fixed")
        if (policyAmountMode !== "pct" && policyAmountMode !== "fija") {
          return await val("policyAmountMode debe ser 'pct' o 'fija'.", "policyAmountMode");
        }
        data.policyAmountMode = policyAmountMode;
      }
      const policyRatePct = pctField("policyRatePct");
      if (policyRatePct != null) data.policyRatePct = policyRatePct;
      const policyAdminRatePct = pctField("policyAdminRatePct");
      if (policyAdminRatePct != null) data.policyAdminRatePct = policyAdminRatePct;
      const policyContractPct = pctField("policyContractPct");
      if (policyContractPct != null) data.policyContractPct = policyContractPct;
      const policyFixedAmountUF = numArg(args, "policyFixedAmountUF");
      if (policyFixedAmountUF != null) {
        if (policyFixedAmountUF < 0) return await val("policyFixedAmountUF ≥ 0.", "policyFixedAmountUF");
        data.policyFixedAmountUF = policyFixedAmountUF;
        if (policyFixedAmountUF === 0) {
          warnings.push("policyFixedAmountUF=0 con modo fija: la póliza no aportará monto.");
        }
      }

      const liabilityEnabled = boolArg(args, "liabilityEnabled");
      if (liabilityEnabled !== undefined) data.liabilityEnabled = liabilityEnabled;
      const liabilityMode = asStr(args, "liabilityMode");
      if (liabilityMode) {
        if (liabilityMode !== "premium" && liabilityMode !== "rate") {
          return await val("liabilityMode debe ser 'premium' o 'rate'.", "liabilityMode");
        }
        data.liabilityMode = liabilityMode;
      }
      const liabilityRatePct = pctField("liabilityRatePct");
      if (liabilityRatePct != null) data.liabilityRatePct = liabilityRatePct;
      const liabilityAnnualPremiumUF = numArg(args, "liabilityAnnualPremiumUF");
      if (liabilityAnnualPremiumUF != null) {
        if (liabilityAnnualPremiumUF < 0) {
          return await val("liabilityAnnualPremiumUF ≥ 0.", "liabilityAnnualPremiumUF");
        }
        data.liabilityAnnualPremiumUF = liabilityAnnualPremiumUF;
      }
      const liabilityAllocationPct = pctField("liabilityAllocationPct");
      if (liabilityAllocationPct != null) data.liabilityAllocationPct = liabilityAllocationPct;
      const liabilityDeductibleUF = numArg(args, "liabilityDeductibleUF");
      if (liabilityDeductibleUF != null) {
        if (liabilityDeductibleUF < 0) return await val("liabilityDeductibleUF ≥ 0.", "liabilityDeductibleUF");
        data.liabilityDeductibleUF = liabilityDeductibleUF;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("RANGE:")) {
        const key = e.message.slice(6);
        return await val(`Valor fuera de rango para ${key}.`, key);
      }
      throw e;
    }

    if (Object.keys(data).length === 0) {
      return await val(
        "Indica al menos un parámetro financiero a cambiar (financialEnabled, policyEnabled, liabilityEnabled, monthlyHoursStandard, contractMonths, etc.).",
        "nofields",
      );
    }

    await prisma.cpqQuoteParameters.upsert({
      where: { quoteId: quote.id },
      create: { quoteId: quote.id, ...data } as Prisma.CpqQuoteParametersUncheckedCreateInput,
      update: data,
    });

    const summary = await recomputeQuoteTotals(quote.id);
    const params = await prisma.cpqQuoteParameters.findUnique({ where: { quoteId: quote.id } });
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        quoteCode: quote.code,
        changedFields: Object.keys(data),
        monthlyCostBefore: before?.monthlyCost != null ? Number(before.monthlyCost) : null,
        monthlyCostAfter: summary.monthlyTotal,
        parameters: params
          ? {
              monthlyHoursStandard: params.monthlyHoursStandard,
              avgStayMonths: params.avgStayMonths,
              uniformChangesPerYear: params.uniformChangesPerYear,
              financialEnabled: params.financialEnabled,
              financialRatePct: Number(params.financialRatePct),
              financialBaseMode: params.financialBaseMode,
              policyEnabled: params.policyEnabled,
              policyAmountMode: params.policyAmountMode,
              policyRatePct: Number(params.policyRatePct),
              policyAdminRatePct: Number(params.policyAdminRatePct),
              policyContractMonths: params.policyContractMonths,
              policyContractPct: Number(params.policyContractPct),
              policyFixedAmountUF: Number(params.policyFixedAmountUF),
              liabilityEnabled: params.liabilityEnabled,
              liabilityMode: params.liabilityMode,
              liabilityRatePct: Number(params.liabilityRatePct),
              liabilityAnnualPremiumUF: Number(params.liabilityAnnualPremiumUF),
              liabilityAllocationPct: Number(params.liabilityAllocationPct),
              liabilityDeductibleUF: Number(params.liabilityDeductibleUF),
              contractMonths: params.contractMonths,
            }
          : null,
        warnings: warnings.length ? warnings : undefined,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}
