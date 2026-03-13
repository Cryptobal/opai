/**
 * FinancialPanel — sticky sidebar for CPQ desktop layout.
 * Two tabs: "Desglose" (cost waterfall) and "Preview" (document preview + AI + send).
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn, formatCLP, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import { formatCurrency, formatWeekdaysShort } from "@/components/cpq/utils";
import { Loader2, Sparkles, ChevronDown, ListChecks, Plus, X } from "lucide-react";
import type {
  CpqQuote,
  CpqPosition,
  CpqQuoteCostSummary,
  CpqQuoteAdditionalLine,
} from "@/types/cpq";
import { QuoteBreakdownPanel } from "@/components/cpq/QuoteBreakdownPanel";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";

/* ── Props ── */

export interface FinancialPanelProps {
  // Summary
  positionsCount: number;
  totalGuards: number;
  marginPct: number;
  salePriceMonthly: number;
  additionalLinesTotal: number;
  ufValue: number | null;
  // Cost breakdown
  costSummary: CpqQuoteCostSummary | null;
  costCategoryBreakdown: {
    equipment: number;
    transport: number;
    vehicle: number;
    infra: number;
    system: number;
  };
  marginAmount: number;
  // Positions for hourly rates
  positions: CpqPosition[];
  positionSalePrices: Map<string, number>;
  positionHourlyRates: Map<string, number>;
  monthlyHoursStandard?: number;
  // Preview tab - quote data
  quote: CpqQuote;
  crmContext: {
    accountId: string;
    installationId: string;
    contactId: string;
    dealId: string;
    currency: string;
  };
  crmContacts: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  }[];
  crmInstallations: { id: string; name: string; city?: string | null }[];
  crmDeals: { id: string; title: string }[];
  additionalLines: CpqQuoteAdditionalLine[];
  // AI generation
  onGenerateAiDescription: () => void;
  generatingAi: boolean;
  aiCustomInstruction: string;
  setAiCustomInstruction: (v: string) => void;
  onGenerateServiceDetail: () => void;
  generatingServiceDetail: boolean;
  serviceDetailInstruction: string;
  setServiceDetailInstruction: (v: string) => void;
  // AI content editable
  aiDescription: string | null;
  onAiDescriptionChange: (v: string) => void;
  serviceDetail: string | null;
  onServiceDetailChange: (v: string) => void;
  // Send actions
  quoteId: string;
  quoteCode: string;
  sendingPortal: boolean;
  onSendPortal: () => void;
  isLocked: boolean;
  // Included items
  includedItems: string[];
  onIncludedItemsChange: (items: string[]) => void;
  // Tenant branding
  tenantBranding?: {
    companyName: string;
    brandNameUpper: string;
    website: string;
    contactEmail: string;
  };
  // Send modal props
  hasAccount: boolean;
  hasContact: boolean;
  hasDeal: boolean;
  dealId?: string;
  contactName?: string;
  contactEmail?: string;
}

/* ── Build breakdown data from props ── */

function buildBreakdownData(
  costSummary: CpqQuoteCostSummary,
  costCategoryBreakdown: FinancialPanelProps["costCategoryBreakdown"],
  positions: CpqPosition[],
  positionSalePrices: Map<string, number>,
  marginPct: number,
  marginAmount: number,
  salePriceMonthly: number,
  additionalLinesTotal: number,
  monthlyHoursStandard: number,
  currency: string,
  ufValue: number | null,
): QuoteBreakdownData {
  const subtotalBase =
    costSummary.monthlyPositions +
    costSummary.monthlyHolidayAdjustment +
    costSummary.monthlyUniforms +
    costSummary.monthlyExams +
    costSummary.monthlyMeals +
    costSummary.monthlyVehicles +
    costSummary.monthlyInfrastructure +
    costSummary.monthlyCostItems;

  const totalPositionCosts = positions.reduce((s, p) => s + Number(p.monthlyPositionCost), 0);
  const fallback = positions.length > 0 ? 1 / positions.length : 0;

  const positionItems: PositionBreakdownItem[] = positions.map((pos) => {
    const snap = pos.payrollSnapshot as Record<string, unknown> | null;
    const bd = (snap?.breakdown ?? {}) as Record<string, unknown>;
    const costClp = Number(pos.monthlyPositionCost ?? 0);
    const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallback;
    const salePrice = positionSalePrices.get(pos.id) ?? (salePriceMonthly * proportion);
    const totalGuardsInPos = Math.max(1, pos.numGuards) * Math.max(1, pos.numPuestos);

    const getNum = (key: string) => Number((bd as Record<string, unknown>)[key] ?? 0) * totalGuardsInPos;
    const getNestedNum = (key: string, sub: string) => {
      const val = bd[key] as Record<string, unknown> | undefined;
      return Number(val?.[sub] ?? 0) * totalGuardsInPos;
    };

    const baseSalary = getNum("base_salary") || (Number(pos.baseSalary ?? 0) * totalGuardsInPos);
    const gratification = getNum("gratification");
    const totalImponible = getNum("total_taxable_income") || baseSalary + gratification;
    const sisEmployer = getNum("sis_employer");
    const afcEmployer = getNestedNum("afc_employer", "total");
    const mutualEmployer = getNestedNum("work_injury_employer", "amount");
    const vacationProvision = getNum("vacation_provision");
    const severanceProvision = getNum("severance_provision");

    return {
      id: pos.id,
      name: pos.customName || pos.puestoTrabajo?.name || "Puesto",
      numGuards: pos.numGuards,
      numPuestos: pos.numPuestos,
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
      salePrice,
      hourlyRateSale:
        totalGuardsInPos > 0 && monthlyHoursStandard > 0
          ? salePrice / (totalGuardsInPos * monthlyHoursStandard)
          : 0,
    };
  });

  return {
    positions: positionItems,
    totalLaborCost: costSummary.monthlyPositions,
    holidayAdjustment: costSummary.monthlyHolidayAdjustment,
    uniforms: costSummary.monthlyUniforms,
    exams: costSummary.monthlyExams,
    meals: costSummary.monthlyMeals,
    vehicles: costSummary.monthlyVehicles,
    infrastructure: costSummary.monthlyInfrastructure,
    equipment: costCategoryBreakdown.equipment,
    transport: costCategoryBreakdown.transport,
    systems: costCategoryBreakdown.system,
    subtotalBase,
    marginPct,
    marginAmount,
    financial: costSummary.monthlyFinancial,
    financialRatePct: costSummary.financialRatePct ?? 0,
    policy: costSummary.monthlyPolicy,
    policyRatePct: costSummary.policyRatePct ?? 0,
    totalSalePrice: salePriceMonthly,
    additionalLines: additionalLinesTotal,
    grandTotal: salePriceMonthly + additionalLinesTotal,
    monthlyHoursStandard,
    currency,
    ufValue: ufValue ?? undefined,
  };
}

/* ── Component ── */

export function FinancialPanel(props: FinancialPanelProps) {
  const {
    positionsCount: _positionsCount,
    totalGuards: _totalGuards,
    marginPct,
    salePriceMonthly,
    additionalLinesTotal,
    ufValue,
    costSummary,
    costCategoryBreakdown,
    marginAmount,
    positions,
    positionSalePrices,
    monthlyHoursStandard = 180,
    quote,
    crmContext,
    crmContacts,
    crmInstallations,
    crmDeals,
    additionalLines,
    onGenerateAiDescription,
    generatingAi,
    aiCustomInstruction,
    setAiCustomInstruction,
    onGenerateServiceDetail,
    generatingServiceDetail,
    serviceDetailInstruction,
    setServiceDetailInstruction,
    aiDescription,
    onAiDescriptionChange,
    serviceDetail,
    onServiceDetailChange,
    quoteId,
    quoteCode,
    sendingPortal,
    onSendPortal,
    isLocked,
    includedItems,
    onIncludedItemsChange,
    hasAccount,
    hasContact,
    hasDeal,
    dealId,
    contactName,
    contactEmail,
    tenantBranding,
  } = props;

  const [activeTab, setActiveTab] = useState<"desglose" | "preview">("desglose");
  const [docAiTab, setDocAiTab] = useState<"description" | "service">("description");

  /* ── Build breakdown data ── */
  const breakdownData = costSummary
    ? buildBreakdownData(
        costSummary,
        costCategoryBreakdown,
        positions,
        positionSalePrices,
        marginPct,
        marginAmount,
        salePriceMonthly,
        additionalLinesTotal,
        monthlyHoursStandard,
        crmContext.currency || "CLP",
        ufValue,
      )
    : null;

  const positionsCount = props.positionsCount;
  const totalGuards = props.totalGuards;

  const totalFact = salePriceMonthly + additionalLinesTotal;
  const ufTotal = ufValue && ufValue > 0 ? salePriceMonthly / ufValue : null;

  const laborCost = costSummary?.monthlyPositions ?? 0;
  const directCosts = (costSummary?.monthlyUniforms ?? 0) + (costSummary?.monthlyExams ?? 0) + (costSummary?.monthlyMeals ?? 0) + (costSummary?.monthlyHolidayAdjustment ?? 0);
  const indirectCosts = (costSummary?.monthlyCostItems ?? 0) + (costSummary?.monthlyVehicles ?? 0) + (costSummary?.monthlyInfrastructure ?? 0);
  const financialCosts = (costSummary?.monthlyFinancial ?? 0) + (costSummary?.monthlyPolicy ?? 0);
  const totalBase = laborCost + directCosts + indirectCosts + financialCosts + marginAmount;
  const pctOf = (v: number) => totalBase > 0 ? Math.round((v / totalBase) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="flex border-b border-border/40">
        <button
          type="button"
          className={cn(
            "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
            activeTab === "desglose"
              ? "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("desglose")}
        >
          Desglose
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
            activeTab === "preview"
              ? "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {/* ── Tab content ── */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {activeTab === "desglose" && (
          <div className="p-2.5 space-y-2">
            {/* Hero Card */}
            <div className="rounded-lg bg-gradient-to-br from-emerald-950 to-card border border-emerald-500/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-400 mb-1.5">
                Precio de venta mensual
              </div>
              <div className="text-xl font-extrabold text-white tabular-nums transition-all duration-300">
                {formatCurrency(salePriceMonthly)}
              </div>
              {ufTotal !== null && (
                <div className="text-[11px] text-emerald-400 mt-0.5">{ufTotal.toFixed(2)} UF</div>
              )}
              <div className="flex gap-4 mt-2 pt-2 border-t border-emerald-500/20">
                <div>
                  <div className="text-[10px] text-muted-foreground">Puestos</div>
                  <div className="text-[15px] font-bold text-foreground">{positionsCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Guardias</div>
                  <div className="text-[15px] font-bold text-foreground">{totalGuards}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Margen</div>
                  <div className="text-[15px] font-bold text-emerald-400">{marginPct}%</div>
                </div>
              </div>
            </div>

            {/* Breakdown with progress bars */}
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2.5">Desglose</div>
              {[
                { label: "Mano de obra", amount: laborCost, color: "bg-emerald-500" },
                { label: "Directos", amount: directCosts, color: "bg-blue-500" },
                { label: "Indirectos", amount: indirectCosts, color: "bg-purple-500" },
                { label: "Financiero", amount: financialCosts, color: "bg-amber-500" },
                { label: "Margen", amount: marginAmount, color: "bg-foreground/60" },
              ].map((item) => (
                <div key={item.label} className="mb-2 last:mb-0">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="text-[11px] font-semibold tabular-nums transition-all duration-300">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full opacity-70 transition-all duration-500", item.color)}
                      style={{ width: `${pctOf(item.amount)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Additional lines summary */}
            {additionalLinesTotal > 0 && (
              <div className="rounded-lg border border-border bg-card p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-1">Líneas adicionales</div>
                <div className="text-lg font-bold text-amber-400 tabular-nums transition-all duration-300">{formatCurrency(additionalLinesTotal)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {additionalLines.length} {additionalLines.length === 1 ? "servicio/producto" : "servicios/productos"}
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Total facturación</div>
                  <div className="text-xl font-extrabold text-white tabular-nums transition-all duration-300">{formatCurrency(totalFact)}</div>
                </div>
              </div>
            )}

            {/* Detailed breakdown panel */}
            {breakdownData && (
              <details className="group">
                <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Ver desglose detallado
                </summary>
                <div className="mt-2">
                  <QuoteBreakdownPanel data={breakdownData} variant="default" />
                </div>
              </details>
            )}
          </div>
        )}

        {activeTab === "preview" && (
          <PreviewTab
            quote={quote}
            positions={positions}
            positionSalePrices={positionSalePrices}
            crmContext={crmContext}
            crmContacts={crmContacts}
            crmInstallations={crmInstallations}
            crmDeals={crmDeals}
            additionalLines={additionalLines}
            additionalLinesTotal={additionalLinesTotal}
            salePriceMonthly={salePriceMonthly}
            ufValue={ufValue}
            aiDescription={aiDescription}
            onAiDescriptionChange={onAiDescriptionChange}
            serviceDetail={serviceDetail}
            onServiceDetailChange={onServiceDetailChange}
            onGenerateAiDescription={onGenerateAiDescription}
            generatingAi={generatingAi}
            aiCustomInstruction={aiCustomInstruction}
            setAiCustomInstruction={setAiCustomInstruction}
            onGenerateServiceDetail={onGenerateServiceDetail}
            generatingServiceDetail={generatingServiceDetail}
            serviceDetailInstruction={serviceDetailInstruction}
            setServiceDetailInstruction={setServiceDetailInstruction}
            docAiTab={docAiTab}
            setDocAiTab={setDocAiTab}
            quoteId={quoteId}
            quoteCode={quoteCode}
            sendingPortal={sendingPortal}
            onSendPortal={onSendPortal}
            isLocked={isLocked}
            includedItems={includedItems}
            onIncludedItemsChange={onIncludedItemsChange}
            hasAccount={hasAccount}
            hasContact={hasContact}
            hasDeal={hasDeal}
            dealId={dealId}
            contactName={contactName}
            contactEmail={contactEmail}
            tenantBranding={tenantBranding}
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tab: Preview
   ══════════════════════════════════════════════════════════════ */

interface PreviewTabProps {
  quote: CpqQuote;
  positions: CpqPosition[];
  positionSalePrices: Map<string, number>;
  crmContext: FinancialPanelProps["crmContext"];
  crmContacts: FinancialPanelProps["crmContacts"];
  crmInstallations: FinancialPanelProps["crmInstallations"];
  crmDeals: FinancialPanelProps["crmDeals"];
  additionalLines: CpqQuoteAdditionalLine[];
  additionalLinesTotal: number;
  salePriceMonthly: number;
  ufValue: number | null;
  aiDescription: string | null;
  onAiDescriptionChange: (v: string) => void;
  serviceDetail: string | null;
  onServiceDetailChange: (v: string) => void;
  onGenerateAiDescription: () => void;
  generatingAi: boolean;
  aiCustomInstruction: string;
  setAiCustomInstruction: (v: string) => void;
  onGenerateServiceDetail: () => void;
  generatingServiceDetail: boolean;
  serviceDetailInstruction: string;
  setServiceDetailInstruction: (v: string) => void;
  docAiTab: "description" | "service";
  setDocAiTab: (v: "description" | "service") => void;
  quoteId: string;
  quoteCode: string;
  sendingPortal: boolean;
  onSendPortal: () => void;
  isLocked: boolean;
  includedItems: string[];
  onIncludedItemsChange: (items: string[]) => void;
  tenantBranding?: FinancialPanelProps["tenantBranding"];
  hasAccount: boolean;
  hasContact: boolean;
  hasDeal: boolean;
  dealId?: string;
  contactName?: string;
  contactEmail?: string;
}

function PreviewTab({
  quote,
  positions,
  positionSalePrices,
  crmContext,
  crmContacts,
  crmInstallations,
  crmDeals,
  additionalLines,
  additionalLinesTotal,
  salePriceMonthly,
  ufValue,
  aiDescription,
  onAiDescriptionChange,
  serviceDetail,
  onServiceDetailChange,
  onGenerateAiDescription,
  generatingAi,
  aiCustomInstruction,
  setAiCustomInstruction,
  onGenerateServiceDetail,
  generatingServiceDetail,
  serviceDetailInstruction,
  setServiceDetailInstruction,
  docAiTab,
  setDocAiTab,
  quoteId,
  quoteCode,
  sendingPortal,
  onSendPortal,
  isLocked,
  includedItems,
  onIncludedItemsChange,
  tenantBranding,
  hasAccount,
  hasContact,
  hasDeal,
  dealId,
  contactName,
  contactEmail,
}: PreviewTabProps) {
  const contact = crmContext.contactId
    ? crmContacts.find((x) => x.id === crmContext.contactId)
    : null;
  const installation = crmContext.installationId
    ? crmInstallations.find((x) => x.id === crmContext.installationId)
    : null;
  const deal = crmContext.dealId
    ? crmDeals.find((d) => d.id === crmContext.dealId)
    : null;

  return (
    <div className="flex flex-col h-full" inert={isLocked ? true : undefined}>
      {/* ── Document preview ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-1.5 bg-muted/20 border-b border-border/40">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Vista previa
          </span>
        </div>
        <div
          className="p-3 space-y-2 bg-white text-black text-xs"
          style={{ fontFamily: "Arial, sans-serif" }}
        >
          {/* Header */}
          <div
            className="flex justify-between items-start pb-1.5"
            style={{ background: "#0f172a", margin: "-12px -12px 8px -12px", padding: "10px 12px", borderRadius: "4px 4px 0 0" }}
          >
            <div className="text-sm font-bold" style={{ color: "#14b8a6" }}>
              {tenantBranding?.brandNameUpper || "EMPRESA"}
            </div>
            <div className="text-right text-[10px]" style={{ color: "#94a3b8" }}>
              <p className="font-bold text-xs" style={{ color: "#14b8a6" }}>
                {quote.code}
                {quote.name ? ` — ${quote.name}` : ""}
              </p>
              <p>{quote.clientName || "Cliente"}</p>
              {contact && (
                <p>
                  {contact.firstName} {contact.lastName}
                </p>
              )}
              {installation && <p>{installation.name}</p>}
              {quote.validUntil && (
                <p>
                  Valida hasta:{" "}
                  {new Date(quote.validUntil).toLocaleDateString("es-CL")}
                </p>
              )}
            </div>
          </div>

          {/* Deal / Installation banner */}
          {(crmContext.dealId || crmContext.installationId) && (
            <div
              className="text-[10px] rounded"
              style={{
                padding: "4px 8px",
                background: "#f8fafc",
                borderLeft: "3px solid #14b8a6",
                color: "#334155",
              }}
            >
              {deal && (
                <span>
                  <strong>Negocio:</strong> {deal.title}
                </span>
              )}
              {crmContext.dealId && crmContext.installationId && " · "}
              {installation && (
                <span>
                  <strong>Instalacion:</strong> {installation.name}
                </span>
              )}
            </div>
          )}

          {/* AI description */}
          {aiDescription && (
            <p className="text-[10px] text-gray-600 rounded p-1.5" style={{ background: "#f8fafc" }}>
              {aiDescription}
            </p>
          )}

          {/* Positions table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #14b8a6" }}>
                  <th className="text-left p-1 font-semibold" style={{ color: "#1e293b" }}>Puesto</th>
                  <th className="text-left p-1 font-semibold" style={{ color: "#1e293b" }}>G</th>
                  <th className="text-left p-1 font-semibold" style={{ color: "#1e293b" }}>Cant</th>
                  <th className="text-left p-1 font-semibold" style={{ color: "#1e293b" }}>Dias</th>
                  <th className="text-left p-1 font-semibold" style={{ color: "#1e293b" }}>Horario</th>
                  <th className="text-right p-1 font-semibold" style={{ color: "#1e293b" }}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const clp =
                    positionSalePrices.get(pos.id) ??
                    Number(pos.monthlyPositionCost);
                  const formatted =
                    crmContext.currency === "UF" && ufValue && ufValue > 0
                      ? formatUFSuffix(clpToUf(clp, ufValue))
                      : formatCLP(clp);
                  return (
                    <tr key={pos.id} className="border-b border-gray-100">
                      <td className="p-1">
                        {pos.customName ||
                          pos.puestoTrabajo?.name ||
                          "Puesto"}
                      </td>
                      <td className="p-1">{pos.numGuards}</td>
                      <td className="p-1">{pos.numPuestos || 1}</td>
                      <td className="p-1">
                        {formatWeekdaysShort(pos.weekdays)}
                      </td>
                      <td className="p-1">
                        {pos.startTime}-{pos.endTime}
                      </td>
                      <td className="p-1 text-right">{formatted}</td>
                    </tr>
                  );
                })}
                <tr
                  className="font-semibold border-t"
                  style={{ borderColor: "#14b8a6", background: "#f8fafc" }}
                >
                  <td colSpan={5} className="p-1 text-right" style={{ color: "#0f172a" }}>
                    Subtotal guardias
                  </td>
                  <td className="p-1 text-right">
                    {crmContext.currency === "UF" && ufValue && ufValue > 0
                      ? formatUFSuffix(clpToUf(salePriceMonthly, ufValue))
                      : formatCLP(salePriceMonthly)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Additional lines preview */}
          {additionalLines.length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold border-b pb-0.5 mb-1"
                style={{ color: "#0f172a" }}
              >
                Servicios y Productos Adicionales
              </p>
              <table className="w-full text-[10px]">
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #14b8a6" }}>
                    <th className="text-left p-1 font-semibold">
                      Producto / Servicio
                    </th>
                    <th className="text-left p-1 font-semibold">
                      Descripcion
                    </th>
                    <th className="text-right p-1 font-semibold">
                      Valor Mensual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {additionalLines
                    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
                    .map((linea, index) => (
                      <tr
                        key={linea.id || index}
                        className="border-b border-gray-100"
                      >
                        <td className="p-1">{linea.nombre || "—"}</td>
                        <td className="p-1 text-gray-600">
                          {linea.descripcion || "—"}
                        </td>
                        <td className="p-1 text-right">
                          {formatCLP(Number(linea.precio))}
                        </td>
                      </tr>
                    ))}
                  <tr
                    className="font-semibold border-t"
                    style={{ background: "#f8fafc" }}
                  >
                    <td colSpan={2} className="p-1 text-right">
                      Subtotal adicionales
                    </td>
                    <td className="p-1 text-right">
                      {formatCLP(additionalLinesTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Total Neto */}
          <div
            className="flex items-center justify-between px-2 py-2 font-bold text-[11px] rounded mt-1"
            style={{ background: "#0f172a", color: "#ffffff" }}
          >
            <span>PRECIO VENTA MENSUAL NETO</span>
            <span style={{ color: "#14b8a6" }}>
              {crmContext.currency === "UF" && ufValue && ufValue > 0
                ? formatUFSuffix(clpToUf(salePriceMonthly + additionalLinesTotal, ufValue))
                : formatCLP(salePriceMonthly + additionalLinesTotal)}
            </span>
          </div>

          {/* Service detail */}
          {serviceDetail && (
            <div>
              <p
                className="text-[10px] font-semibold border-b pb-0.5 mb-1"
                style={{ color: "#0f172a" }}
              >
                Detalle del servicio
              </p>
              <div className="text-[10px] text-gray-700 whitespace-pre-line leading-relaxed">
                {serviceDetail}
              </div>
            </div>
          )}

          <div className="text-center text-[9px] text-gray-400 border-t pt-1">
            Generado el {new Date().toLocaleDateString("es-CL")}{tenantBranding?.website ? ` · ${tenantBranding.website}` : ""}
          </div>
        </div>

        {/* ── AI generation controls ── */}
        <Card className="m-3 p-2.5 space-y-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                docAiTab === "description"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setDocAiTab("description")}
            >
              Descripcion AI
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium border-l border-border transition-colors",
                docAiTab === "service"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setDocAiTab("service")}
            >
              Detalle servicio
            </button>
          </div>

          {docAiTab === "description" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  value={aiCustomInstruction}
                  onChange={(e) => setAiCustomInstruction(e.target.value)}
                  placeholder="Instruccion AI (opcional)"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] shrink-0"
                  onClick={onGenerateAiDescription}
                  disabled={generatingAi}
                >
                  {generatingAi ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {generatingAi ? "..." : "Generar"}
                </Button>
              </div>
              <textarea
                value={aiDescription ?? ""}
                onChange={(e) => onAiDescriptionChange(e.target.value)}
                placeholder="Clic en 'Generar' para crear una descripcion profesional..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={4}
              />
            </div>
          )}

          {docAiTab === "service" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  value={serviceDetailInstruction}
                  onChange={(e) => setServiceDetailInstruction(e.target.value)}
                  placeholder="Instruccion AI (opcional)"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] shrink-0"
                  onClick={onGenerateServiceDetail}
                  disabled={generatingServiceDetail}
                >
                  {generatingServiceDetail ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {generatingServiceDetail ? "..." : "Generar"}
                </Button>
              </div>
              <textarea
                value={serviceDetail ?? ""}
                onChange={(e) => onServiceDetailChange(e.target.value)}
                placeholder="Clic en 'Generar' para detalle de servicios..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={4}
              />
            </div>
          )}
        </Card>

        {/* ── Included Items (Incluye) ── */}
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-xs font-semibold">Incluye</span>
            <span className="text-[10px] text-muted-foreground">(aparece en PDF)</span>
          </div>
          {includedItems.length === 0 && !isLocked ? (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Sin items. Agrega desde las sugerencias:</p>
              {[
                "Personal acreditado ante OS-10 de Carabineros",
                "Supervisión periódica en terreno",
                "Cobertura por ausencias (reemplazo máx. 4 hrs)",
                "Seguro responsabilidad civil y accidentes laborales",
                "Libro de novedades digital vía OPAI",
                "Reportería mensual de operaciones",
              ].map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex items-center gap-1.5 w-full text-left text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/20 rounded px-1.5 py-1 transition-colors"
                  onClick={() => onIncludedItemsChange([...includedItems, item])}
                >
                  <Plus className="h-3 w-3 text-teal-400 shrink-0" />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {includedItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1 group">
                  <span className="text-teal-400 text-[10px] shrink-0">●</span>
                  <input
                    value={item}
                    onChange={(e) => {
                      const updated = [...includedItems];
                      updated[idx] = e.target.value;
                      onIncludedItemsChange(updated);
                    }}
                    disabled={isLocked}
                    className="flex-1 text-[10px] bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground py-0.5"
                    placeholder="Item..."
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onIncludedItemsChange(includedItems.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              {!isLocked && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 transition-colors pt-0.5"
                  onClick={() => onIncludedItemsChange([...includedItems, ""])}
                >
                  <Plus className="h-3 w-3" /> Agregar ítem
                </button>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Action buttons moved to header in CpqQuoteDetail (desktop) — MobileBottomBar handles mobile */}
    </div>
  );
}
