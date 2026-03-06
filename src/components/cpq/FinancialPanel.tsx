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
import { SendCpqQuoteModal } from "@/components/cpq/SendCpqQuoteModal";
import { SendPdfEmailModal } from "@/components/cpq/SendPdfEmailModal";
import { Loader2, Sparkles, Shield, ChevronDown, ListChecks, Plus, X } from "lucide-react";
import type {
  CpqQuote,
  CpqPosition,
  CpqQuoteCostSummary,
  CpqQuoteAdditionalLine,
} from "@/types/cpq";

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
  // Send modal props
  hasAccount: boolean;
  hasContact: boolean;
  hasDeal: boolean;
  contactName?: string;
  contactEmail?: string;
}

/* ── Helpers ── */

interface WaterfallCategory {
  label: string;
  amount: number;
  color: string; // tailwind bg class
  barColor: string; // filled bar color
  isSeparator?: boolean; // subtotal separator
  pctLabel?: string; // show % next to label
}

function buildWaterfallCategories(
  costSummary: CpqQuoteCostSummary,
  breakdown: FinancialPanelProps["costCategoryBreakdown"],
  additionalLinesTotal: number,
): WaterfallCategory[] {
  const cats: WaterfallCategory[] = [];

  const push = (label: string, amount: number, color: string, barColor: string, extra?: Partial<WaterfallCategory>) => {
    if (amount > 0) cats.push({ label, amount, color, barColor, ...extra });
  };

  // Labor
  push("Mano de obra", costSummary.monthlyPositions, "bg-blue-500/20", "bg-blue-500");
  push("Feriados", costSummary.monthlyHolidayAdjustment, "bg-blue-400/20", "bg-blue-400");

  // Direct costs
  push("Uniformes", costSummary.monthlyUniforms, "bg-teal-500/20", "bg-teal-500");
  push("Exámenes", costSummary.monthlyExams, "bg-teal-400/20", "bg-teal-400");
  push("Alimentación", costSummary.monthlyMeals, "bg-teal-600/20", "bg-teal-600");

  // Indirect costs
  push("Equipo", breakdown.equipment, "bg-amber-500/20", "bg-amber-500");
  push("Transporte", breakdown.transport, "bg-amber-400/20", "bg-amber-400");
  push("Vehículos", breakdown.vehicle, "bg-amber-600/20", "bg-amber-600");
  push("Infraestructura", breakdown.infra, "bg-amber-500/20", "bg-amber-500");
  push("Sistemas", breakdown.system, "bg-amber-400/20", "bg-amber-400");

  // Subtotal base separator
  const subtotalBase = cats.reduce((s, c) => s + c.amount, 0);
  cats.push({ label: "Subtotal base", amount: subtotalBase, color: "", barColor: "", isSeparator: true });

  // Financial (percentage-based)
  push("Financiero", costSummary.monthlyFinancial, "bg-orange-500/20", "bg-orange-500", {
    pctLabel: costSummary.financialRatePct ? `${costSummary.financialRatePct}%` : undefined,
  });
  push("Póliza", costSummary.monthlyPolicy, "bg-purple-500/20", "bg-purple-500", {
    pctLabel: costSummary.policyRatePct ? `${costSummary.policyRatePct}%` : undefined,
  });

  // Additional lines
  push("Líneas adicionales", additionalLinesTotal, "bg-purple-400/20", "bg-purple-400");

  return cats;
}

/* ── Component ── */

export function FinancialPanel(props: FinancialPanelProps) {
  const {
    positionsCount,
    totalGuards,
    marginPct,
    salePriceMonthly,
    additionalLinesTotal,
    ufValue,
    costSummary,
    costCategoryBreakdown,
    marginAmount,
    positions,
    positionSalePrices,
    positionHourlyRates,
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
    contactName,
    contactEmail,
  } = props;

  const [activeTab, setActiveTab] = useState<"desglose" | "preview">("desglose");
  const [showHourly, setShowHourly] = useState(false);
  const [docAiTab, setDocAiTab] = useState<"description" | "service">("description");

  const totalSale = salePriceMonthly + additionalLinesTotal;

  /* ── Waterfall data ── */
  const categories = costSummary
    ? buildWaterfallCategories(costSummary, costCategoryBreakdown, additionalLinesTotal)
    : [];
  const realCategories = categories.filter((c) => !c.isSeparator);
  const totalCosts = realCategories.reduce((s, c) => s + c.amount, 0);
  const maxCategoryAmount = Math.max(...realCategories.map((c) => c.amount), 1);

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
      <div className="overflow-y-auto flex-1">
        {activeTab === "desglose" && (
          <DesgloseTab
            totalSale={totalSale}
            salePriceMonthly={salePriceMonthly}
            additionalLinesTotal={additionalLinesTotal}
            ufValue={ufValue}
            positionsCount={positionsCount}
            totalGuards={totalGuards}
            marginPct={marginPct}
            categories={categories}
            totalCosts={totalCosts}
            maxCategoryAmount={maxCategoryAmount}
            marginAmount={marginAmount}
            positions={positions}
            positionHourlyRates={positionHourlyRates}
            showHourly={showHourly}
            setShowHourly={setShowHourly}
          />
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
            contactName={contactName}
            contactEmail={contactEmail}
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tab: Desglose
   ══════════════════════════════════════════════════════════════ */

interface DesgloseTabProps {
  totalSale: number;
  salePriceMonthly: number;
  additionalLinesTotal: number;
  ufValue: number | null;
  positionsCount: number;
  totalGuards: number;
  marginPct: number;
  categories: WaterfallCategory[];
  totalCosts: number;
  maxCategoryAmount: number;
  marginAmount: number;
  positions: CpqPosition[];
  positionHourlyRates: Map<string, number>;
  showHourly: boolean;
  setShowHourly: (v: boolean) => void;
}

function DesgloseTab({
  totalSale,
  salePriceMonthly,
  additionalLinesTotal,
  ufValue,
  positionsCount,
  totalGuards,
  marginPct,
  categories,
  totalCosts,
  maxCategoryAmount,
  marginAmount,
  positions,
  positionHourlyRates,
  showHourly,
  setShowHourly,
}: DesgloseTabProps) {
  return (
    <div className="p-3 space-y-3">
      {/* ── Sale hero ── */}
      <div className="bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
        <div className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
          Venta Mensual
        </div>
        <div className="font-bold text-2xl text-foreground">
          {formatCLP(totalSale)}
        </div>
        {ufValue && ufValue > 0 && (
          <div className="text-sm text-emerald-400/60 mt-0.5">
            {formatUFSuffix(clpToUf(totalSale, ufValue))}
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>P:{positionsCount}</span>
          <span>G:{totalGuards}</span>
          <span>M:{marginPct}%</span>
        </div>
      </div>

      {/* ── Waterfall bars ── */}
      {categories.length > 0 && (
        <div className="space-y-1.5">
          {categories.map((cat) => {
            if (cat.isSeparator) {
              return (
                <div key={cat.label} className="flex items-center justify-between border-t border-dashed border-border/60 pt-1.5 mt-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">{cat.label}</span>
                  <span className="font-mono text-[11px] font-semibold">{formatCurrency(cat.amount)}</span>
                </div>
              );
            }
            const pct = totalSale > 0 ? (cat.amount / totalSale) * 100 : 0;
            const barWidthPct =
              maxCategoryAmount > 0
                ? (cat.amount / maxCategoryAmount) * 100
                : 0;
            return (
              <div key={cat.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {cat.label}
                    {cat.pctLabel && <span className="ml-1 text-[10px] opacity-60">{cat.pctLabel}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="font-mono text-xs">
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                </div>
                <div className={cn("h-1.5 rounded-full w-full mt-0.5", cat.color)}>
                  <div
                    className={cn("h-1.5 rounded-full transition-all", cat.barColor)}
                    style={{ width: `${Math.max(barWidthPct, 0.5)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Totals ── */}
      <div className="border-t border-border/40 pt-2 space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground font-semibold">Total costos</span>
          <span className="font-mono font-semibold">{formatCurrency(totalCosts)}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-emerald-700 dark:text-emerald-400">
          <span className="font-semibold">Margen ({marginPct}%)</span>
          <span className="font-mono font-semibold">{formatCurrency(marginAmount)}</span>
        </div>
      </div>

      {/* ── Value per hour ── */}
      {positions.length > 0 && (
        <div className="border-t border-emerald-500/20 pt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors w-full"
            onClick={() => setShowHourly(!showHourly)}
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showHourly ? "rotate-0" : "-rotate-90",
              )}
            />
            Valor hora por puesto
          </button>
          {showHourly && (
            <div className="mt-1.5 space-y-1">
              {positions.map((pos) => {
                const name =
                  pos.customName || pos.puestoTrabajo?.name || "Puesto";
                const rate = positionHourlyRates.get(pos.id) ?? 0;
                return (
                  <div
                    key={pos.id}
                    className="flex items-center justify-between pl-2 text-[11px]"
                  >
                    <span className="text-muted-foreground truncate">
                      {name}
                    </span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0 ml-2">
                      {formatCurrency(rate)}/hr
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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
  hasAccount: boolean;
  hasContact: boolean;
  hasDeal: boolean;
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
  hasAccount,
  hasContact,
  hasDeal,
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
              GARD SECURITY
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
            Generado el {new Date().toLocaleDateString("es-CL")} · www.gard.cl
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

      {/* ── Action buttons (sticky at bottom) ── */}
      <div className="border-t border-border/40 p-3 space-y-2">
        <SendCpqQuoteModal
          quoteId={quoteId}
          quoteCode={quoteCode}
          clientName={quote.clientName || undefined}
          disabled={!quote || positions.length === 0 || quote.status === "sent"}
          hasAccount={hasAccount}
          hasContact={hasContact}
          hasDeal={hasDeal}
          contactName={contactName}
          contactEmail={contactEmail}
        />
        <Button
          className="w-full h-11 gap-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white"
          disabled={
            !quote ||
            positions.length === 0 ||
            quote.status === "sent" ||
            !hasAccount ||
            !hasContact ||
            !hasDeal ||
            sendingPortal
          }
          onClick={onSendPortal}
        >
          {sendingPortal ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {sendingPortal ? "Enviando..." : "Enviar por Portal"}
        </Button>
        <SendPdfEmailModal
          quoteId={quoteId}
          quoteCode={quoteCode}
          contactEmail={contactEmail}
          contactName={contactName}
          companyName={quote.clientName || undefined}
          disabled={!contactEmail}
        />
      </div>
    </div>
  );
}
