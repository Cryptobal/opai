/**
 * API Route: /api/crm/leads/[id]/proposal-preview
 * POST - Generate a Propuesta Técnica PDF preview directly from lead data (no quote required).
 * Builds ProposalProps on-the-fly mirroring the CPQ proposal-pdf logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import type { ProposalProps } from "@/lib/pdf/templates/proposal/build-proposal-props";
import type { ProposalAIContent } from "@/lib/pdf/templates/proposal/proposal-ai";
import type { QuoteBreakdownData, PositionBreakdownItem, ResourceBreakdownCategory, ResourceBreakdownItem } from "@/types/cpq-breakdown";
import { formatCurrency, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { generateProposalAIContent } from "@/lib/pdf/templates/proposal/proposal-ai";
import {
  computeLeadPositionCostsFromPayroll,
  type LeadPositionLike,
} from "@/lib/cpq/lead-labor-from-payroll";
import { buildCpqQuotePdfFileName } from "@/lib/pdf/cpq-quote-pdf-filename";
import { requireTenantModule } from '@/lib/require-module';

export const runtime = "nodejs";
export const maxDuration = 60;

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
  /** Especificaciones técnicas editadas en el lead (mismo shape que LeadInstallationCpq) */
  technicalSpecs?: string | null;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    await params;
    const body = await request.json();

    const {
      accountName = "Cliente",
      installationName = "",
      quoteName,
      quoteCode = "Borrador",
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
        { success: false, error: "Se necesita al menos un puesto para generar la presentación" },
        { status: 400 }
      );
    }

    const ufValue =
      typeof bodyUfValue === "number" && bodyUfValue > 0 ? bodyUfValue : null;
    const totalGuards = positions.reduce(
      (s: number, p: LeadPosition) => s + (p.cantidad || 1) * (p.numPuestos || 1),
      0
    );

    type PositionCostResult = {
      name: string; guards: number; numPuestos: number; totalGuardsInPos: number;
      salary: number; gratificacion: number; totalImponible: number;
      sisEmployer: number; afcEmployer: number; mutualEmployer: number;
      vacationProvision: number; severanceProvision: number;
      costoGuardia: number; totalCost: number;
      baseSalaryTotal: number; gratificacionTotal: number;
      days: string; schedule: string;
    };

    const positionCosts: PositionCostResult[] = await computeLeadPositionCostsFromPayroll(
      positions as LeadPositionLike[],
      ufValue
    );

    const totalLaborCost = positionCosts.reduce((s, p) => s + p.totalCost, 0);

    /* ── Holiday adjustment ── */
    const holidayAdjustment = totalLaborCost > 0
      ? (totalLaborCost / 30) * 0.5 * (12 / 12) * 1.1
      : 0;

    /* ── Cost items ── */
    const enabledCosts = costItems.filter((c: LeadCostItem) => c.enabled);
    const previewContractMonths = Number(conditions.contractDuration || 12);

    let uniformRotatingCost = 0;
    let uniformProratedCost = 0;
    let examSetCost = 0;

    const typeToSlug: Record<string, string> = {
      phone: "operational", radio: "operational", flashlight: "operational",
      system: "system", transport: "transport",
      vehicle_rent: "vehicle", vehicle_fuel: "vehicle", vehicle_tag: "vehicle",
      infrastructure: "infrastructure", fuel: "infrastructure",
      meal: "meal",
      other: "other",
    };
    const costItemBySlug: Record<string, number> = {};

    for (const c of enabledCosts) {
      const unitPrice = normalizeUnitPrice(c.priceOverride ?? c.basePrice, c.unit, previewContractMonths);
      if (c.type === "uniform") {
        const logic = c.priceLogic ?? "uniform";
        if (logic === "prorated") uniformProratedCost += unitPrice;
        else uniformRotatingCost += unitPrice;
      } else if (c.type === "exam") {
        examSetCost += unitPrice;
      } else if (c.type !== "financial" && c.type !== "policy") {
        const slug = typeToSlug[c.type] ?? "other";
        costItemBySlug[slug] = (costItemBySlug[slug] ?? 0) + unitPrice;
      }
    }

    const monthlyUniforms = totalGuards > 0
      ? (((uniformRotatingCost * uniformChangesPerYear) / 12) + uniformProratedCost) * totalGuards : 0;
    const examFrequency = Math.max(avgStayMonths > 0 ? 12 / avgStayMonths : 0, uniformChangesPerYear);
    const monthlyExams = totalGuards > 0
      ? ((examSetCost * examFrequency) / 12) * totalGuards : 0;

    const monthlyEquipment = costItemBySlug["operational"] ?? 0;
    const monthlyTransport = costItemBySlug["transport"] ?? 0;
    const monthlySystems = costItemBySlug["system"] ?? 0;
    const monthlyVehicleItems = costItemBySlug["vehicle"] ?? 0;
    const monthlyInfraItems = costItemBySlug["infrastructure"] ?? 0;
    const monthlyMealItems = costItemBySlug["meal"] ?? 0;
    const monthlyOther = costItemBySlug["other"] ?? 0;
    const otherCostItemsTotal = monthlyEquipment + monthlyTransport + monthlySystems
      + monthlyVehicleItems + monthlyInfraItems + monthlyMealItems + monthlyOther;
    const totalAdditionalCosts = monthlyUniforms + monthlyExams + otherCostItemsTotal;

    /* ── Margin ── */
    const costoBase = totalLaborCost + holidayAdjustment + totalAdditionalCosts;
    const financialEnabled = financialCosts.financialEnabled === true;
    const financialRatePct = Number(financialCosts.financialRatePct || 2.5);
    const salePriceBaseManual = Number(financialCosts.salePriceBase || 0);
    const policyEnabled = financialCosts.policyEnabled === true;
    const policyRatePct = Number(financialCosts.policyRatePct || 0);
    const policyContractMonths = Number(financialCosts.policyContractMonths || 12);
    const policyContractPct = Number(financialCosts.policyContractPct || 100) / 100;

    const marginPctRaw = marginPercentage / 100;
    const laborCostForMargin = totalLaborCost + holidayAdjustment;
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
    const pdfAdditionalLines = (additionalLines as LeadAdditionalLine[])
      .filter((l) => {
        const precio = Number(l.precio || l.monthlyAmount || 0);
        return precio > 0 || (l.nombre || l.name || "").trim().length > 0;
      })
      .map((l) => {
        const precio = Number(l.precio || 0);
        const cantidad = Number(l.cantidad || 1);
        const marginPctLine = Number(l.marginPct || 0);
        const base = precio * cantidad;
        const venta = marginPctLine > 0 && marginPctLine < 100 ? base / (1 - marginPctLine / 100) : base;
        const isUnico = l.recurrencia === "unico";
        const mensual = isUnico && contractDuration > 0 ? venta / contractDuration : venta;
        return { nombre: l.nombre || l.name || "Línea adicional", precioVenta: mensual };
      });

    const totalAdditionalLinesAmount = pdfAdditionalLines.reduce((s, l) => s + l.precioVenta, 0);
    const grandTotal = totalSalePrice + totalAdditionalLinesAmount;

    /* ── Items for PDF ── */
    const fmt = (n: number) =>
      currency === "UF" && ufValue && ufValue > 0
        ? formatUFSuffix(clpToUf(n, ufValue))
        : formatCurrency(n, "CLP");
    let idx = 1;
    const items: ProposalProps["items"] = [];

    for (const pos of positionCosts) {
      const proportion = totalLaborCost > 0 ? pos.totalCost / totalLaborCost : 1 / positionCosts.length;
      const salePrice = totalSalePrice * proportion;
      const unitPrice = pos.totalGuardsInPos > 0 ? salePrice / pos.totalGuardsInPos : salePrice;
      items.push({
        index: idx++,
        description: `${pos.name} · ${pos.totalGuardsInPos} guardia(s) · ${pos.days} · ${pos.schedule}`,
        quantity: pos.totalGuardsInPos,
        unitPrice,
        subtotal: salePrice,
        unitPriceFormatted: fmt(unitPrice),
        subtotalFormatted: fmt(salePrice),
      });
    }

    for (const line of pdfAdditionalLines) {
      if (line.precioVenta <= 0) continue;
      items.push({
        index: idx++,
        description: line.nombre,
        quantity: 1,
        unitPrice: line.precioVenta,
        subtotal: line.precioVenta,
        unitPriceFormatted: fmt(line.precioVenta),
        subtotalFormatted: fmt(line.precioVenta),
      });
    }

    /* ── Breakdown ── */
    const monthlyHoursStandard = 180;
    const positionBreakdownItems: PositionBreakdownItem[] = positionCosts.map((pos, i) => {
      const proportion = totalLaborCost > 0 ? pos.totalCost / totalLaborCost : 1 / positionCosts.length;
      return {
        id: `lead-pos-${i}`,
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
      uniforms: monthlyUniforms,
      exams: monthlyExams,
      meals: monthlyMealItems,
      vehicles: monthlyVehicleItems,
      infrastructure: monthlyInfraItems,
      equipment: monthlyEquipment,
      transport: monthlyTransport,
      systems: monthlySystems,
      other: monthlyOther,
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

    /* ── Service / regime ── */
    const serviceType = positions.length > 0
      ? positions.map((p: LeadPosition) => p.puesto || "Puesto").join(", ")
      : "Servicio de seguridad";

    const firstPos = positions[0] as LeadPosition | undefined;
    const coverageSchedule = firstPos
      ? `${firstPos.horaInicio || "08:00"} - ${firstPos.horaFin || "20:00"}, ${(firstPos.dias || []).join(", ")}`
      : "A definir";

    const staffingRegime = positions.length > 0
      ? positions.map((p: LeadPosition) => `${p.cantidad || 1}x${p.numPuestos || 1}`).join(" + ")
      : `${totalGuards} guardias`;

    let regimeExplanation = "";
    const regimeRaw = staffingRegime.toLowerCase();
    if (regimeRaw.includes("4x4") || regimeRaw.includes("4×4")) {
      regimeExplanation = "El turno 4x4 (4 días trabajados, 4 días de descanso) es el esquema óptimo para turnos nocturnos.";
    } else if (regimeRaw.includes("5x2") || regimeRaw.includes("5×2")) {
      regimeExplanation = "El turno 5x2 (5 días de trabajo, 2 de descanso) es ideal para coberturas diurnas en horario de oficina.";
    }

    const paymentTerms =
      conditions.paymentTerms === "contrafactura" ? "Mensual, contra entrega de factura"
        : conditions.paymentTerms === "30_dias" ? "30 días"
        : conditions.paymentTerms === "anticipado" ? "Pago anticipado"
        : String(conditions.paymentTerms || "Mensual, contra entrega de factura");

    /* ── Company config ── */
    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);
    const baseUrl = getCanonicalSiteUrl();
    const abs = (url: string | undefined | null): string => {
      if (!url) return "";
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
      return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    };

    const companyLogo = abs(companyConfig.brandingLogoWhite) || abs(companyConfig.brandingLogoFull) || abs(companyConfig.logoUrl) || "";

    /* ── Client logos from DB ── */
    const clientesConLogo = await prisma.crmAccount.findMany({
      where: { tenantId: ctx.tenantId, status: "client_active", logoUrl: { not: null } },
      select: { name: true, logoUrl: true },
      take: 20,
    });

    /* ── AI content ── */
    let aiContent: ProposalAIContent;
    try {
      aiContent = await generateProposalAIContent({
        companyName: accountName,
        contactName: accountName,
        serviceName: serviceType,
        staffingDetails: `${totalGuards} guardias en régimen ${staffingRegime}`,
        coverageSchedule,
        monthlyTotal: grandTotal,
        installationName: installationName || undefined,
        existingAiDescription: companyDescription || serviceDescription || undefined,
        items: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          specifications: i.specifications,
        })),
      }, ctx.tenantId);
    } catch {
      aiContent = {
        descripcionBreve: `Servicio de seguridad integral para ${accountName}`,
        resumenEjecutivo: `Propuesta de ${totalGuards} guardias con cobertura ${coverageSchedule}.`,
        analisisNecesidades: serviceDescription || companyDescription || "",
        sectoresRelevantes: [],
      };
    }

    const proposalDate = new Date().toLocaleDateString("es-CL");

    /* ── Resource breakdown for detailed section ── */
    const resCats: ResourceBreakdownCategory[] = [];

    const slugToCategory: Record<string, { name: string; type: "direct" | "indirect" }> = {
      uniform: { name: "Uniformes", type: "direct" },
      exam: { name: "Exámenes Médicos", type: "direct" },
      meal: { name: "Alimentación", type: "direct" },
      operational: { name: "Equipos Operativos", type: "indirect" },
      system: { name: "Sistemas", type: "indirect" },
      transport: { name: "Transporte", type: "indirect" },
      vehicle: { name: "Vehículos", type: "indirect" },
      infrastructure: { name: "Infraestructura", type: "indirect" },
      other: { name: "Otros Costos", type: "indirect" },
    };

    const findOrCreateResCat = (slug: string) => {
      const meta = slugToCategory[slug] ?? { name: "Otros Costos", type: "indirect" as const };
      let cat = resCats.find((c) => c.category === meta.name);
      if (!cat) {
        cat = { category: meta.name, categoryType: meta.type, items: [], subtotal: 0 };
        resCats.push(cat);
      }
      return cat;
    };

    for (const c of enabledCosts) {
      if (c.type === "financial" || c.type === "policy") continue;
      const unitPrice = normalizeUnitPrice(c.priceOverride ?? c.basePrice, c.unit, previewContractMonths);
      let monthlyAmount: number;
      let unit: string | undefined;

      if (c.type === "uniform") {
        const logic = c.priceLogic ?? "uniform";
        monthlyAmount = logic === "prorated"
          ? unitPrice * totalGuards
          : ((unitPrice * uniformChangesPerYear) / 12) * totalGuards;
        unit = "por guardia/mes";
      } else if (c.type === "exam") {
        monthlyAmount = ((unitPrice * examFrequency) / 12) * totalGuards;
        unit = "por guardia/mes";
      } else {
        monthlyAmount = unitPrice;
        unit = c.unit || undefined;
      }

      const itemSlug = c.type === "uniform" ? "uniform"
        : c.type === "exam" ? "exam"
        : c.type === "meal" ? "meal"
        : (typeToSlug[c.type] ?? "other");

      const cat = findOrCreateResCat(itemSlug);
      const specs = (c.technicalSpecs != null && String(c.technicalSpecs).trim() !== "")
        ? String(c.technicalSpecs).trim()
        : null;
      cat.items.push({ name: c.name, amount: monthlyAmount, unit, technicalSpecs: specs });
      cat.subtotal += monthlyAmount;
    }

    const resourceBreakdown = resCats.filter((c) => c.items.length > 0);

    const props: ProposalProps = {
      companyName: accountName,
      quotationCode: "PREVIEW",
      proposalDate,
      contactName: accountName,

      ai: aiContent,

      serviceType,
      installationName: installationName || "-",
      installationAddress: "-",
      coverageSchedule,
      staffingCount: totalGuards,
      staffingRegime,
      supervisionFrequency: "Mínimo 2 supervisiones por turno",

      items,
      totalNeto: grandTotal,
      totalNetoFormatted: fmt(grandTotal),
      currency: currency || "CLP",
      ufValue: ufValue ?? undefined,
      paymentTerms,

      companyLogo,
      providerLogo: companyLogo,
      opaiLogo: `${baseUrl}/opai-logo.png`,
      lx3Logo: `${baseUrl}/lx3-logo.png`,
      clientLogos: clientesConLogo.filter((c) => c.logoUrl).map((c) => c.logoUrl!),
      portalScreenshots: {},

      companyConfig: {
        commercialName: companyConfig?.commercialName || "OPAI",
        companyName: companyConfig?.companyName || "",
        brandNameUpper: companyConfig?.brandNameUpper || (companyConfig?.commercialName || "OPAI").toUpperCase(),
        website: companyConfig?.website || "",
        phone: companyConfig?.phone || "",
        email: companyConfig?.email || "",
        brandingLogoWhite: companyConfig?.brandingLogoWhite || undefined,
        brandingLogoFull: companyConfig?.brandingLogoFull || undefined,
        brandingLogoIcon: companyConfig?.brandingLogoIcon || undefined,
      },
      clientLogosWithNames: clientesConLogo
        .filter((c) => c.logoUrl)
        .map((c) => ({ name: c.name, url: abs(c.logoUrl)! })),

      companyStats: {
        yearsInOperation: "5+",
        activeGuards: "50+",
        protectedFacilities: "20+",
        regionsCount: "3+",
      },
      regimeExplanation,
      breakdown,
      resourceBreakdown: resourceBreakdown.length > 0 ? resourceBreakdown : undefined,
      includedItems: [],
    };

    const pdfBuffer = await renderProposalToBufferFromProps(props);

    const fileName = buildCpqQuotePdfFileName({
      clientName: accountName,
      installationName,
      quoteName: typeof quoteName === "string" ? quoteName : undefined,
      quoteCode: typeof quoteCode === "string" ? quoteCode : "Borrador",
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[Lead Proposal Preview] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Error al generar presentación: ${msg}` },
      { status: 500 }
    );
  }
}
