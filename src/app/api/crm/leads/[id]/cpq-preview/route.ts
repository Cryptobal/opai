/**
 * API Route: /api/crm/leads/[id]/cpq-preview
 * POST - Generate a real PDF preview from lead installation data (no quote required).
 * Builds QuotationPDFProps mirroring the CPQ export-pdf logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";
import {
  resolveCanonicalSections,
  normalizeDbSectionsToProposalFormat,
} from "@/lib/pdf/templates/quotation/build-quotation-props";
import { DEFAULT_TEMPLATE_SECTIONS, DEFAULT_COMPLIANCE_ITEMS } from "@/lib/pdf/templates/quotation/render-quotation";
import type { QuotationPDFProps, AdditionalLinePDF, LaborBreakdownPDF, LaborPositionDetailPDF } from "@/lib/pdf/templates/quotation/render-quotation";
import type { ProposalTemplateSections, CostByCategory, CostByCategoryItem } from "@/types/cpq";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";
import { formatCurrency, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";
import {
  computeLeadPositionCostsFromPayroll,
  type LeadPositionLike,
} from "@/lib/cpq/lead-labor-from-payroll";

export const runtime = "nodejs";
export const maxDuration = 30;

interface LeadPosition {
  puesto?: string;
  customName?: string;
  cantidad?: number;
  numPuestos?: number;
  horaInicio?: string;
  horaFin?: string;
  dias?: string[];
  baseSalary?: number;
  shiftType?: string;
}

interface LeadCostItem {
  name: string;
  type: string;
  unit?: string;
  basePrice: number;
  priceOverride: number | null;
  enabled: boolean;
  priceLogic?: string;
}

function normalizeUnitPrice(value: number, unit?: string | null, contractMonths?: number): number {
  if (!unit) return value;
  const n = unit.toLowerCase();
  if (n.includes("contrato") || n.includes("contract")) {
    const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
    return value / months;
  }
  if (n.includes("año") || n.includes("year")) return value / 12;
  if (n.includes("semestre") || n.includes("semester")) return value / 6;
  return value;
}

interface LeadAdditionalLine {
  nombre?: string;
  name?: string;
  monthlyAmount?: number;
  precio?: number;
  cantidad?: number;
  marginPct?: number | null;
  recurrencia?: string;
}

type PositionCostResult = {
  name: string;
  guards: number;
  numPuestos: number;
  totalGuardsInPos: number;
  salary: number;
  gratificacion: number;
  totalImponible: number;
  sisEmployer: number;
  afcEmployer: number;
  mutualEmployer: number;
  vacationProvision: number;
  severanceProvision: number;
  costoGuardia: number;
  totalCost: number;
  baseSalaryTotal: number;
  gratificacionTotal: number;
  days: string;
  schedule: string;
};

const COST_TYPE_CATEGORY: Record<string, { category: "direct" | "indirect"; group: string; slug: string }> = {
  uniform: { category: "direct", group: "Uniformes", slug: "uniform" },
  exam: { category: "direct", group: "Exámenes", slug: "exam" },
  meal: { category: "direct", group: "Alimentación", slug: "meal" },
  phone: { category: "indirect", group: "Equipos operativos", slug: "operational" },
  radio: { category: "indirect", group: "Equipos operativos", slug: "operational" },
  flashlight: { category: "indirect", group: "Equipos operativos", slug: "operational" },
  transport: { category: "indirect", group: "Transporte", slug: "transport" },
  vehicle_rent: { category: "indirect", group: "Vehículos", slug: "vehicle" },
  vehicle_fuel: { category: "indirect", group: "Vehículos", slug: "vehicle" },
  vehicle_tag: { category: "indirect", group: "Vehículos", slug: "vehicle" },
  infrastructure: { category: "indirect", group: "Infraestructura", slug: "infrastructure" },
  fuel: { category: "indirect", group: "Infraestructura", slug: "infrastructure" },
  system: { category: "indirect", group: "Sistemas", slug: "system" },
  other: { category: "indirect", group: "Otros Costos", slug: "other" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    await params;
    const body = await request.json();

    const {
      templateSlug = "standard",
      accountName = "Cliente",
      installationName = "",
      positions = [] as LeadPosition[],
      costItems = [] as LeadCostItem[],
      additionalLines = [] as LeadAdditionalLine[],
      marginPercentage = 13,
      marginMode = "margin_on_sale",
      financialCosts = {} as Record<string, unknown>,
      companyDescription,
      serviceDescription,
      conditions = {} as Record<string, unknown>,
      uniformChangesPerYear = 3,
      avgStayMonths = 4,
      currency = "CLP",
      ufValue: bodyUfValue,
    } = body;

    if (!positions || positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se necesita al menos un puesto para generar el preview" },
        { status: 400 }
      );
    }

    const ufValue =
      typeof bodyUfValue === "number" && bodyUfValue > 0 ? bodyUfValue : null;
    const monthlyHoursStandard = 180;
    const totalGuards = positions.reduce(
      (s: number, p: LeadPosition) => s + (p.cantidad || 1) * (p.numPuestos || 1),
      0
    );

    /* ── Labor cost per position (motor payroll, mismo que CPQ) ── */
    const positionCosts: PositionCostResult[] = await computeLeadPositionCostsFromPayroll(
      positions as LeadPositionLike[],
      ufValue
    );

    const totalLaborCost = positionCosts.reduce((s: number, p: PositionCostResult) => s + p.totalCost, 0);

    /* ── Holiday adjustment (same as CPQ) ── */
    const holidayAnnualCount = 12;
    const holidayBufferPct = 10;
    const holidayAdjustment = totalLaborCost > 0
      ? (totalLaborCost / 30) * 0.5 * (holidayAnnualCount / 12) * (1 + holidayBufferPct / 100)
      : 0;

    /* ── Cost items with CPQ formulas ── */
    const enabledCosts = costItems.filter((c: LeadCostItem) => c.enabled);
    const previewContractMonths = Number(conditions.contractDuration || 12);

    let uniformRotatingCost = 0;
    let uniformProratedCost = 0;
    let examSetCost = 0;
    let otherCostItemsTotal = 0;

    const categoryMap = new Map<string, { category: "direct" | "indirect"; group: string; slug: string; items: CostByCategoryItem[] }>();

    for (const c of enabledCosts) {
      const meta = COST_TYPE_CATEGORY[c.type];
      if (!meta) continue;
      const unitPrice = normalizeUnitPrice(c.priceOverride ?? c.basePrice, c.unit, previewContractMonths);

      if (c.type === "uniform") {
        const logic = c.priceLogic ?? "uniform";
        if (logic === "prorated") {
          uniformProratedCost += unitPrice;
        } else {
          uniformRotatingCost += unitPrice;
        }
      } else if (c.type === "exam") {
        examSetCost += unitPrice;
      } else {
        otherCostItemsTotal += unitPrice;
      }

      const key = meta.slug;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { ...meta, items: [] });
      }
      categoryMap.get(key)!.items.push({
        name: c.name,
        amount: unitPrice,
        calcMode: "per_month",
      });
    }

    const monthlyUniforms = totalGuards > 0
      ? (((uniformRotatingCost * uniformChangesPerYear) / 12) + uniformProratedCost) * totalGuards : 0;
    const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
    const examFrequency = Math.max(examEntriesPerYear, uniformChangesPerYear);
    const monthlyExams = totalGuards > 0
      ? ((examSetCost * examFrequency) / 12) * totalGuards : 0;

    const totalAdditionalCosts = monthlyUniforms + monthlyExams + otherCostItemsTotal;

    // Update category subtotals with mensualised amounts
    const uniformCat = categoryMap.get("uniform");
    if (uniformCat) {
      uniformCat.items = uniformCat.items.map((i) => {
        const c = enabledCosts.find((ci: LeadCostItem) => ci.name === i.name && ci.type === "uniform");
        const logic = c?.priceLogic ?? "uniform";
        if (logic === "prorated") {
          return { ...i, amount: totalGuards > 0 ? i.amount * totalGuards : 0 };
        }
        return { ...i, amount: totalGuards > 0 ? ((i.amount * uniformChangesPerYear) / 12) * totalGuards : 0 };
      });
    }
    const examCat = categoryMap.get("exam");
    if (examCat) {
      examCat.items = examCat.items.map((i) => ({
        ...i,
        amount: totalGuards > 0 ? ((i.amount * examFrequency) / 12) * totalGuards : 0,
      }));
    }

    const costsByCategory: CostByCategory[] = [];
    for (const [, cat] of categoryMap) {
      costsByCategory.push({
        category: cat.group,
        categorySlug: cat.slug,
        categoryType: cat.category,
        items: cat.items,
        subtotal: cat.items.reduce((s, i) => s + i.amount, 0),
      });
    }

    const sumBySlug = (slugs: string[]) =>
      costsByCategory.filter((c) => slugs.includes(c.categorySlug)).reduce((s, c) => s + c.subtotal, 0);

    /* ── Financial ── */
    const costoBase = totalLaborCost + holidayAdjustment + totalAdditionalCosts;
    const financialEnabled = financialCosts.financialEnabled === true;
    const financialRatePct = Number(financialCosts.financialRatePct || 2.5);
    const salePriceBaseManual = Number(financialCosts.salePriceBase || 0);
    const policyEnabled = financialCosts.policyEnabled === true;
    const policyRatePct = Number(financialCosts.policyRatePct || 0);
    const policyContractMonths = Number(financialCosts.policyContractMonths || 12);
    const policyContractPct = Number(financialCosts.policyContractPct || 100) / 100;

    /* ── Margin (same logic as compute-quote-costs) ── */
    const laborCostForMargin = totalLaborCost + holidayAdjustment;
    const marginPctRaw = marginPercentage / 100;
    let baseWithMargin: number;
    if (marginMode === "markup") {
      baseWithMargin = costoBase * (1 + marginPctRaw);
    } else if (marginMode === "margin_on_labor") {
      const laborWithMargin = marginPctRaw < 1 ? laborCostForMargin / (1 - marginPctRaw) : laborCostForMargin;
      baseWithMargin = laborWithMargin + totalAdditionalCosts;
    } else {
      baseWithMargin = marginPctRaw < 1 ? costoBase / (1 - marginPctRaw) : costoBase;
    }
    const marginAmount = baseWithMargin - costoBase;

    const effectiveSalePriceBase = salePriceBaseManual > 0 ? salePriceBaseManual : baseWithMargin;
    const financialAmount = financialEnabled && effectiveSalePriceBase > 0
      ? effectiveSalePriceBase * (financialRatePct / 100) : 0;

    const montoAnual = effectiveSalePriceBase * policyContractMonths;
    const valorGarantia = montoAnual * policyContractPct;
    const policyAmount = policyEnabled && effectiveSalePriceBase > 0
      ? (valorGarantia * (policyRatePct / 100)) / 12 : 0;

    const totalSalePrice = baseWithMargin + financialAmount + policyAmount;

    /* ── Additional lines ── */
    const contractDuration = Number(conditions.contractDuration || 12);
    const pdfAdditionalLines: AdditionalLinePDF[] = additionalLines
      .filter((l: LeadAdditionalLine) => {
        const precio = Number(l.precio || l.monthlyAmount || 0);
        return precio > 0 || (l.nombre || l.name || "").trim().length > 0;
      })
      .map((l: LeadAdditionalLine) => {
        const precio = Number(l.precio || 0);
        const cantidad = Number(l.cantidad || 1);
        const marginPctLine = Number(l.marginPct || 0);
        const base = precio * cantidad;
        const venta = marginPctLine > 0 && marginPctLine < 100 ? base / (1 - marginPctLine / 100) : base;
        const isUnico = l.recurrencia === "unico";
        const mensual = isUnico && contractDuration > 0 ? venta / contractDuration : venta;
        return {
          nombre: l.nombre || l.name || "Línea adicional",
          descripcion: "",
          tipo: "recurrente",
          recurrencia: l.recurrencia || "mensual",
          precioMensual: base,
          marginPct: marginPctLine,
          precioVenta: mensual,
          precioVentaFmt: fmt(mensual),
        };
      });

    const totalAdditionalLinesAmount = pdfAdditionalLines.reduce((s, l) => s + l.precioVenta, 0);
    const grandTotal = totalSalePrice + totalAdditionalLinesAmount;

    const fmt = (n: number) =>
      currency === "UF" && ufValue && ufValue > 0
        ? formatUFSuffix(clpToUf(n, ufValue))
        : formatCurrency(n, "CLP");

    /* ── Positions for PDF ── */
    const pdfPositions = positionCosts.map((pos: PositionCostResult) => {
      const proportion = totalLaborCost > 0 ? pos.totalCost / totalLaborCost : 1 / positionCosts.length;
      const positionSaleValue = totalSalePrice * proportion;
      return {
        name: pos.name,
        guards: pos.guards,
        quantity: pos.numPuestos,
        days: pos.days,
        schedule: pos.schedule,
        monthlyValue: fmt(positionSaleValue),
      };
    });

    /* ── Breakdown (estructura de costos) ── */
    const positionBreakdownItems: PositionBreakdownItem[] = positionCosts.map((pos: PositionCostResult, idx: number) => {
      const proportion = totalLaborCost > 0 ? pos.totalCost / totalLaborCost : 1 / positionCosts.length;
      return {
        id: `lead-pos-${idx}`,
        name: pos.name,
        numGuards: pos.guards,
        numPuestos: pos.numPuestos,
        totalGuardsInPosition: pos.totalGuardsInPos,
        baseSalary: pos.baseSalaryTotal,
        gratification: pos.gratificacionTotal,
        totalImponible: pos.totalImponible * pos.totalGuardsInPos,
        sisEmployer: pos.sisEmployer,
        afcEmployer: pos.afcEmployer,
        mutualEmployer: pos.mutualEmployer,
        vacationProvision: pos.vacationProvision,
        severanceProvision: pos.severanceProvision,
        totalLaborCost: pos.totalCost,
        salePrice: totalSalePrice * proportion,
        hourlyRateSale: pos.totalGuardsInPos > 0 && monthlyHoursStandard > 0
          ? (totalSalePrice * proportion) / (pos.totalGuardsInPos * monthlyHoursStandard) : 0,
      };
    });

    const breakdown: QuoteBreakdownData = {
      positions: positionBreakdownItems,
      totalLaborCost,
      holidayAdjustment,
      uniforms: sumBySlug(["uniform"]),
      exams: sumBySlug(["exam"]),
      meals: sumBySlug(["meal"]),
      vehicles: sumBySlug(["vehicle"]),
      infrastructure: sumBySlug(["infrastructure"]),
      equipment: sumBySlug(["operational"]),
      transport: sumBySlug(["transport"]),
      systems: sumBySlug(["system"]),
      other: sumBySlug(["other"]),
      subtotalBase: costoBase,
      marginPct: marginPercentage,
      marginAmount,
      financial: financialAmount,
      financialRatePct,
      policy: policyAmount,
      policyRatePct,
      totalSalePrice,
      additionalLines: totalAdditionalLinesAmount,
      grandTotal,
      monthlyHoursStandard,
      currency: currency || "CLP",
      ufValue: ufValue ?? undefined,
    };

    /* ── Labor breakdown ── */
    const avgSalary = totalGuards > 0
      ? positionCosts.reduce((s: number, p: PositionCostResult) => s + p.salary * p.totalGuardsInPos, 0) / totalGuards : 0;
    const avgGrat = totalGuards > 0
      ? positionCosts.reduce((s: number, p: PositionCostResult) => s + p.gratificacion * p.totalGuardsInPos, 0) / totalGuards : 0;
    const avgCostPerGuard = totalGuards > 0 ? totalLaborCost / totalGuards : 0;
    const cargasPct = avgSalary > 0 ? ((avgCostPerGuard - avgSalary - avgGrat) / (avgSalary + avgGrat)) * 100 : 24.35;

    const laborPositionDetails: LaborPositionDetailPDF[] = positionCosts.map((pos: PositionCostResult) => ({
      name: pos.name,
      totalGuardsInPosition: pos.totalGuardsInPos,
      baseSalary: pos.baseSalaryTotal,
      gratification: pos.gratificacionTotal,
      totalImponible: pos.totalImponible * pos.totalGuardsInPos,
      sisEmployer: pos.sisEmployer,
      afcEmployer: pos.afcEmployer,
      mutualEmployer: pos.mutualEmployer,
      vacationProvision: pos.vacationProvision,
      severanceProvision: pos.severanceProvision,
      totalLaborCost: pos.totalCost,
    }));

    const laborBreakdown: LaborBreakdownPDF = {
      sueldoBrutoPromedio: avgSalary,
      cargasSocialesPct: cargasPct,
      gratificacion: avgGrat,
      totalPorGuardia: avgCostPerGuard,
      totalGuardias: totalGuards,
      totalMensual: totalLaborCost,
      positionDetails: laborPositionDetails,
    };

    /* ── Included items (show monthly amounts from costsByCategory) ── */
    const includedItems: string[] = [];
    for (const cat of costsByCategory) {
      for (const item of cat.items) {
        if (item.amount > 0) {
          includedItems.push(`${item.name}: ${fmt(item.amount)}/mes`);
        }
      }
    }

    /* ── Template sections (from DB first, canonical fallback) ── */
    let templateSections: ProposalTemplateSections;
    const dbTemplate = await prisma.cpqProposalTemplate.findFirst({
      where: {
        slug: templateSlug,
        active: true,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
    });
    if (dbTemplate) {
      const rawSections = (dbTemplate.sections ?? {}) as Record<string, unknown>;
      const hasContent = Object.keys(rawSections).length > 0;
      if (hasContent) {
        const hasCanonicalKeys = Object.keys(rawSections).some((k) => k.startsWith("show"));
        const normalized = hasCanonicalKeys
          ? (rawSections as Partial<ProposalTemplateSections>)
          : normalizeDbSectionsToProposalFormat(rawSections, templateSlug);
        templateSections = { ...DEFAULT_TEMPLATE_SECTIONS, ...normalized };
      } else {
        templateSections = { ...DEFAULT_TEMPLATE_SECTIONS, ...(resolveCanonicalSections(templateSlug) || {}) };
      }
    } else {
      templateSections = { ...DEFAULT_TEMPLATE_SECTIONS, ...(resolveCanonicalSections(templateSlug) || {}) };
    }

    /* ── Company config ── */
    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);

    /* ── Only real additional lines go to additionalServices ── */
    const additionalServices = pdfAdditionalLines
      .filter((l) => l.precioVenta > 0)
      .map((l) => ({
        product: l.nombre,
        description: l.descripcion || "-",
        monthlyValue: l.precioVentaFmt,
      }));

    const props: QuotationPDFProps = {
      quote: {
        code: "PREVIEW",
        name: `Propuesta ${accountName}`,
        currency: currency || "CLP",
        createdAt: new Date().toISOString().split("T")[0],
      },
      client: {
        name: accountName,
        accountName,
        installationName: installationName || undefined,
      },
      positions: pdfPositions,
      additionalServices,
      totals: {
        subtotalGuards: fmt(totalSalePrice),
        subtotalAdditional: fmt(totalAdditionalLinesAmount),
        totalNet: fmt(grandTotal),
      },
      conditions: {
        paymentTerms:
          conditions.paymentTerms === "contrafactura" ? "Contrafactura"
            : conditions.paymentTerms === "30_dias" ? "30 días"
            : conditions.paymentTerms === "anticipado" ? "Pago anticipado"
            : String(conditions.paymentTerms || "Contrafactura"),
        serviceStartDays: Number(conditions.serviceStartDays || 5),
        contractDuration,
      },
      companyConfig: {
        commercialName: companyConfig?.commercialName || "GARD SECURITY",
        companyName: companyConfig?.companyName || "Gard Security SpA",
        email: companyConfig?.email || "",
        phone: companyConfig?.phone || "",
        website: companyConfig?.website || "",
        repLegalNombre: companyConfig?.repLegalNombre || undefined,
        brandNameUpper: (companyConfig?.commercialName || "GARD SECURITY").toUpperCase(),
        logoUrl: companyConfig?.logoUrl || undefined,
      },
      includedItems,
      aiDescription: companyDescription || undefined,
      serviceDetail: serviceDescription || undefined,
      breakdown,
      templateSections,
      costsByCategory,
      additionalLines: pdfAdditionalLines.filter((l) => l.precioVenta > 0),
      laborBreakdown,
      complianceItems: templateSections.showComplianceSection ? DEFAULT_COMPLIANCE_ITEMS : undefined,
    };

    const pdfBuffer = await renderQuotationToBuffer(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${accountName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating lead CPQ preview:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to generate PDF: ${msg}` },
      { status: 500 }
    );
  }
}
