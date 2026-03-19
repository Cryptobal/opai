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
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";
import { formatCurrency } from "@/lib/utils";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";
import { generateProposalAIContent } from "@/lib/pdf/templates/proposal/proposal-ai";

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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    await params;
    const body = await request.json();

    const {
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
    } = body;

    if (!positions || positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se necesita al menos un puesto para generar la presentación" },
        { status: 400 }
      );
    }

    const IMM = 500000;
    const totalGuards = positions.reduce(
      (s: number, p: LeadPosition) => s + (p.cantidad || 1) * (p.numPuestos || 1),
      0
    );

    /* ── Labor cost per position ── */
    type PositionCostResult = {
      name: string; guards: number; numPuestos: number; totalGuardsInPos: number;
      salary: number; gratificacion: number; totalImponible: number;
      sisEmployer: number; afcEmployer: number; mutualEmployer: number;
      vacationProvision: number; severanceProvision: number;
      costoGuardia: number; totalCost: number;
      baseSalaryTotal: number; gratificacionTotal: number;
      days: string; schedule: string;
    };

    const positionCosts: PositionCostResult[] = positions.map((pos: LeadPosition) => {
      const salary = pos.baseSalary || 550000;
      const guards = pos.cantidad || 1;
      const numPuestos = pos.numPuestos || 1;
      const totalGuardsInPos = guards * numPuestos;
      const gratificacion = Math.min(salary * 0.25, (4.75 * IMM) / 12);
      const baseConGrat = salary + gratificacion;
      const cargasSociales = baseConGrat * 0.2435;
      const sisEmployer = baseConGrat * 0.0141;
      const afcEmployer = baseConGrat * 0.024;
      const mutualEmployer = baseConGrat * 0.0093;
      const vacationProvision = salary * (15 / 360);
      const severanceProvision = (salary + gratificacion) / 12;
      const costoGuardia = salary + gratificacion + cargasSociales;

      return {
        name: pos.puesto || "Puesto",
        guards, numPuestos, totalGuardsInPos,
        salary, gratificacion,
        totalImponible: baseConGrat,
        sisEmployer: sisEmployer * totalGuardsInPos,
        afcEmployer: afcEmployer * totalGuardsInPos,
        mutualEmployer: mutualEmployer * totalGuardsInPos,
        vacationProvision: vacationProvision * totalGuardsInPos,
        severanceProvision: severanceProvision * totalGuardsInPos,
        costoGuardia, totalCost: costoGuardia * totalGuardsInPos,
        baseSalaryTotal: salary * totalGuardsInPos,
        gratificacionTotal: gratificacion * totalGuardsInPos,
        days: (pos.dias || []).join(", ") || "-",
        schedule: `${pos.horaInicio || "-"} - ${pos.horaFin || "-"}`,
      };
    });

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
    let otherCostItemsTotal = 0;

    for (const c of enabledCosts) {
      const unitPrice = normalizeUnitPrice(c.priceOverride ?? c.basePrice, c.unit, previewContractMonths);
      if (c.type === "uniform") {
        const logic = c.priceLogic ?? "uniform";
        if (logic === "prorated") uniformProratedCost += unitPrice;
        else uniformRotatingCost += unitPrice;
      } else if (c.type === "exam") {
        examSetCost += unitPrice;
      } else {
        otherCostItemsTotal += unitPrice;
      }
    }

    const monthlyUniforms = totalGuards > 0
      ? (((uniformRotatingCost * uniformChangesPerYear) / 12) + uniformProratedCost) * totalGuards : 0;
    const examFrequency = Math.max(avgStayMonths > 0 ? 12 / avgStayMonths : 0, uniformChangesPerYear);
    const monthlyExams = totalGuards > 0
      ? ((examSetCost * examFrequency) / 12) * totalGuards : 0;
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
    const fmt = (n: number) => formatCurrency(n, "CLP");
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
      meals: 0,
      vehicles: 0,
      infrastructure: 0,
      equipment: 0,
      transport: 0,
      systems: 0,
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
    const abs = (url: string | undefined | null): string => {
      if (!url) return "";
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
      return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    };

    const gardLogo = abs(companyConfig.brandingLogoWhite) || abs(companyConfig.brandingLogoFull) || abs(companyConfig.logoUrl) || `${baseUrl}/logo-gard-blanco.svg`;

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
      });
    } catch {
      aiContent = {
        descripcionBreve: `Servicio de seguridad integral para ${accountName}`,
        resumenEjecutivo: `Propuesta de ${totalGuards} guardias con cobertura ${coverageSchedule}.`,
        analisisNecesidades: serviceDescription || companyDescription || "",
        sectoresRelevantes: [],
      };
    }

    const proposalDate = new Date().toLocaleDateString("es-CL");

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
      paymentTerms,

      gardLogo,
      opaiLogo: `${baseUrl}/opai-logo.png`,
      lx3Logo: `${baseUrl}/lx3-logo.png`,
      clientLogos: clientesConLogo.filter((c) => c.logoUrl).map((c) => c.logoUrl!),
      portalScreenshots: {},

      companyConfig: {
        commercialName: companyConfig?.commercialName || "GARD SECURITY",
        website: companyConfig?.website || "",
        phone: companyConfig?.phone || "",
        email: companyConfig?.email || "",
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
    };

    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Propuesta-Tecnica-${accountName.replace(/\s+/g, "-")}-PREVIEW.pdf"`,
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
