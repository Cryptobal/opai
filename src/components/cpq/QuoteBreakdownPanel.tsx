"use client";

/**
 * QuoteBreakdownPanel — transparent cost breakdown for client + CPQ.
 *
 * Two views:
 *   "total"    — waterfall of all cost categories + pricing
 *   "por-puesto" — per-position payroll breakdown + hourly sale rate
 *
 * Variant "dark" is used in the client portal (dark bg).
 * Variant "default" is used inside the CPQ sidebar.
 */

import { useState } from "react";
import { ChevronDown, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";

/* ── Props ── */

export interface QuoteBreakdownPanelProps {
  data: QuoteBreakdownData;
  /** "dark" = portal (dark bg), "default" = CPQ sidebar */
  variant?: "dark" | "default";
}

/* ══════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════ */

export function QuoteBreakdownPanel({
  data,
  variant = "default",
}: QuoteBreakdownPanelProps) {
  const [mode, setMode] = useState<"total" | "por-puesto">("total");

  const isDark = variant === "dark";

  return (
    <div className="space-y-3">
      {/* ── Hero price ── */}
      <div
        className={cn(
          "rounded-xl p-4 text-center",
          isDark
            ? "bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20"
            : "bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20",
        )}
      >
        <div className="text-xs uppercase tracking-wider font-semibold text-emerald-500 mb-1">
          Precio Venta Mensual
        </div>
        <CpqDualCurrencyAmount
          clp={data.grandTotal}
          currency={data.currency}
          ufValue={data.ufValue}
          size="lg"
          isDark={isDark}
          primaryClassName={isDark ? "!text-white" : "text-foreground"}
          secondaryClassName={isDark ? "!text-emerald-400/75" : "text-emerald-600/80"}
          align="center"
        />
        <div className={cn("flex items-center justify-center gap-3 mt-2 text-xs", isDark ? "text-zinc-400" : "text-muted-foreground")}>
          <span>Margen {data.marginPct}%</span>
          {data.financialRatePct > 0 && <span>Financiero {data.financialRatePct}%</span>}
        </div>
      </div>

      {/* ── Mode selector ── */}
      <div
        className={cn(
          "flex rounded-lg p-1",
          isDark ? "bg-white/[0.05]" : "bg-muted/50",
        )}
      >
        <button
          type="button"
          onClick={() => setMode("total")}
          className={cn(
            "flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors",
            mode === "total"
              ? isDark
                ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                : "bg-background text-foreground shadow-sm"
              : isDark
              ? "text-zinc-400 hover:text-zinc-300"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Resumen total
        </button>
        <button
          type="button"
          onClick={() => setMode("por-puesto")}
          className={cn(
            "flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors",
            mode === "por-puesto"
              ? isDark
                ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                : "bg-background text-foreground shadow-sm"
              : isDark
              ? "text-zinc-400 hover:text-zinc-300"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Por puesto
        </button>
      </div>

      {/* ── Content ── */}
      {mode === "total" ? (
        <TotalView data={data} isDark={isDark} />
      ) : (
        <PorPuestoView data={data} isDark={isDark} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Total View
   ══════════════════════════════════════════════════════════════ */

interface TotalViewProps {
  data: QuoteBreakdownData;
  isDark: boolean;
}

function AmountCell({
  clp,
  data,
  isDark,
  size = "xs",
  primaryClassName,
  secondaryClassName,
  wrapperClassName,
}: {
  clp: number;
  data: QuoteBreakdownData;
  isDark: boolean;
  size?: "xs" | "sm" | "md";
  primaryClassName?: string;
  secondaryClassName?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={cn(cpqBreakdownAmount(), wrapperClassName)}>
      <CpqDualCurrencyAmount
        clp={clp}
        currency={data.currency}
        ufValue={data.ufValue}
        size={size}
        isDark={isDark}
        primaryClassName={primaryClassName}
        secondaryClassName={secondaryClassName}
        align="right"
      />
    </div>
  );
}

function TotalView({ data, isDark }: TotalViewProps) {
  const [laborExpanded, setLaborExpanded] = useState(false);

  const grandTotal = data.grandTotal;

  const pct = (n: number) =>
    grandTotal > 0 ? `${((n / grandTotal) * 100).toFixed(0)}%` : "0%";

  const rowCls = cn(
    CPQ_BREAKDOWN_ROW,
    "text-xs py-1",
    isDark ? "text-zinc-300" : "text-foreground/80",
  );
  const labelCls = cn("text-xs min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground");

  /* ── Sections ── */
  const sections: {
    title: string;
    color: string;
    items: { label: string; amount: number; sub?: boolean }[];
  }[] = [
    {
      title: "Mano de Obra",
      color: "bg-blue-500",
      items: [{ label: "Costo empleador total", amount: data.totalLaborCost }],
    },
    {
      title: "Costos Directos",
      color: "bg-teal-500",
      items: [
        { label: "Ajuste feriados", amount: data.holidayAdjustment },
        { label: "Uniformes", amount: data.uniforms },
        { label: "Exámenes médicos", amount: data.exams },
        { label: "Alimentación", amount: data.meals },
      ].filter((i) => i.amount > 0),
    },
    {
      title: "Costos Indirectos",
      color: "bg-amber-500",
      items: [
        { label: "Equipo operativo", amount: data.equipment },
        { label: "Transporte", amount: data.transport },
        { label: "Vehículos", amount: data.vehicles },
        { label: "Infraestructura", amount: data.infrastructure },
        { label: "Sistemas", amount: data.systems },
        { label: "Otros costos", amount: data.other ?? 0 },
      ].filter((i) => i.amount > 0),
    },
  ];

  /* ── Labor expanded detail ── */
  const laborBreakdown = (() => {
    const totalImponible = data.positions.reduce((s, p) => s + p.totalImponible, 0);
    const imposiciones = data.positions.reduce(
      (s, p) => s + p.sisEmployer + p.afcEmployer + p.mutualEmployer,
      0,
    );
    const provisiones = data.positions.reduce(
      (s, p) => s + p.vacationProvision + p.severanceProvision,
      0,
    );
    return { totalImponible, imposiciones, provisiones };
  })();

  return (
    <div className={cn(CPQ_BREAKDOWN_SHELL, "space-y-2")}>
      {/* ── Cost sections ── */}
      {sections.map((section) => {
        const sectionTotal = section.items.reduce((s, i) => s + i.amount, 0);
        if (sectionTotal <= 0) return null;
        const isLabor = section.title === "Mano de Obra";

        return (
          <div
            key={section.title}
            className={cn(
              "rounded-lg border",
              isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-border bg-muted/20",
            )}
          >
            {/* Section header */}
            <button
              type="button"
              onClick={isLabor ? () => setLaborExpanded((v) => !v) : undefined}
              className={cn(
                "w-full grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center px-3 py-2 text-left",
                isLabor ? "cursor-pointer" : "cursor-default",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("w-2 h-2 rounded-full shrink-0", section.color)} />
                <span
                  className={cn(
                    "text-sm font-semibold uppercase tracking-wide break-words",
                    isDark ? "text-zinc-300" : "text-foreground",
                  )}
                >
                  {section.title}
                </span>
              </div>
              <div className="flex items-center gap-2 justify-end shrink-0">
                <span className={cn("text-xs tabular-nums", isDark ? "text-zinc-500" : "text-muted-foreground")}>
                  {pct(sectionTotal)}
                </span>
                <AmountCell
                  clp={sectionTotal}
                  data={data}
                  isDark={isDark}
                  primaryClassName={isDark ? "text-zinc-200" : "text-foreground font-semibold"}
                />
                {isLabor && (
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform shrink-0",
                      isDark ? "text-zinc-500" : "text-muted-foreground",
                      laborExpanded ? "rotate-180" : "",
                    )}
                  />
                )}
              </div>
            </button>

            {/* Labor expanded detail */}
            {isLabor && laborExpanded && (
              <div
                className={cn(
                  "border-t px-3 pb-2 pt-1.5 space-y-1",
                  isDark ? "border-white/[0.06]" : "border-border",
                )}
              >
                <div className={rowCls}>
                  <span className={labelCls}>Sueldos imponibles</span>
                  <AmountCell
                    clp={laborBreakdown.totalImponible}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-200" : "text-foreground font-medium"}
                  />
                </div>
                <div className={rowCls}>
                  <span className={labelCls}>Imposiciones empleador</span>
                  <AmountCell
                    clp={laborBreakdown.imposiciones}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-200" : "text-foreground font-medium"}
                  />
                </div>
                <div className={rowCls}>
                  <span className={labelCls}>Provisiones (vacac. + finiquito)</span>
                  <AmountCell
                    clp={laborBreakdown.provisiones}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-200" : "text-foreground font-medium"}
                  />
                </div>
              </div>
            )}

            {/* Non-labor items */}
            {!isLabor && section.items.length > 1 && (
              <div
                className={cn(
                  "border-t px-3 pb-2 pt-1.5 space-y-1",
                  isDark ? "border-white/[0.06]" : "border-border",
                )}
              >
                {section.items.map((item) => (
                  <div key={item.label} className={rowCls}>
                    <span className={labelCls}>{item.label}</span>
                    <AmountCell
                      clp={item.amount}
                      data={data}
                      isDark={isDark}
                      primaryClassName={isDark ? "text-zinc-200" : "text-foreground font-medium"}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Subtotal base ── */}
      <div
        className={cn(
          CPQ_BREAKDOWN_ROW,
          "px-3 py-1.5 rounded-lg text-xs",
          isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-muted border border-border",
        )}
      >
        <span className={cn("font-semibold min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground")}>
          Subtotal costos base
        </span>
        <AmountCell
          clp={data.subtotalBase}
          data={data}
          isDark={isDark}
          primaryClassName={isDark ? "text-zinc-300" : "text-foreground font-semibold"}
        />
      </div>

      {/* ── Margin ── */}
      <div
        className={cn(
          "rounded-lg border px-3 py-2 space-y-1",
          isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-500/30 bg-emerald-500/5",
        )}
      >
        <div className={cn(CPQ_BREAKDOWN_ROW, "text-xs")}>
          <span className="text-sm font-semibold uppercase tracking-wide text-emerald-500 break-words min-w-0">
            Margen comercial
          </span>
          <span className={cpqBreakdownAmount("text-xs text-emerald-500/70 font-normal")}>
            {data.marginPct}% sobre precio venta
          </span>
        </div>
        <div className={cn(CPQ_BREAKDOWN_ROW, "text-xs")}>
          <span className={cn("min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground")}>
            Margen mensual
          </span>
          <AmountCell
            clp={data.marginAmount}
            data={data}
            isDark={isDark}
            primaryClassName="text-emerald-500 font-semibold"
          />
        </div>
      </div>

      {/* ── Financial / Policy ── */}
      {(data.financial > 0 || data.policy > 0) && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 space-y-1",
            isDark ? "border-orange-500/20 bg-orange-500/5" : "border-orange-500/20 bg-orange-500/5",
          )}
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-orange-500/80">
            Costo Financiero
          </span>
          {data.financial > 0 && (
            <div className={cn(CPQ_BREAKDOWN_ROW, "text-xs")}>
              <span className={cn("min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Financiero ({data.financialRatePct}%)
              </span>
              <AmountCell
                clp={data.financial}
                data={data}
                isDark={isDark}
                primaryClassName={isDark ? "text-zinc-300" : "text-foreground font-medium"}
              />
            </div>
          )}
          {data.policy > 0 && (
            <div className={cn(CPQ_BREAKDOWN_ROW, "text-xs")}>
              <span className={cn("min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Póliza ({data.policyRatePct}%)
              </span>
              <AmountCell
                clp={data.policy}
                data={data}
                isDark={isDark}
                primaryClassName={isDark ? "text-zinc-300" : "text-foreground font-medium"}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Grand total ── */}
      <div
        className={cn(
          "rounded-lg border px-3 py-3 mt-1",
          isDark
            ? "border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/5"
            : "border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-teal-500/5",
        )}
      >
        <div className={cn(CPQ_BREAKDOWN_ROW, "text-sm")}>
          <span className={cn("font-bold min-w-0 break-words", isDark ? "text-white" : "text-foreground")}>
            Precio venta mensual
          </span>
          <AmountCell
            clp={data.grandTotal}
            data={data}
            isDark={isDark}
            size="sm"
            primaryClassName="text-emerald-500 font-bold"
          />
        </div>
        {data.additionalLines > 0 && (
          <div
            className={cn(
              CPQ_BREAKDOWN_ROW,
              "text-xs mt-1 pt-1 border-t",
              isDark ? "border-white/[0.06] text-zinc-400" : "border-border text-muted-foreground",
            )}
          >
            <span className="min-w-0 break-words">Incluye líneas adicionales</span>
            <AmountCell
              clp={data.additionalLines}
              data={data}
              isDark={isDark}
              primaryClassName={isDark ? "text-zinc-300" : "text-foreground"}
            />
          </div>
        )}
        <div className={cn("text-xs mt-1.5", isDark ? "text-zinc-500" : "text-muted-foreground")}>
          Valores netos · IVA se factura según ley vigente
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Por Puesto View
   ══════════════════════════════════════════════════════════════ */

interface PorPuestoViewProps {
  data: QuoteBreakdownData;
  isDark: boolean;
}

function PorPuestoView({ data, isDark }: PorPuestoViewProps) {
  return (
    <div className={cn(CPQ_BREAKDOWN_SHELL, "space-y-2")}>
      {data.positions.map((pos) => (
        <PositionCard
          key={pos.id}
          pos={pos}
          data={data}
          isDark={isDark}
          monthlyHours={data.monthlyHoursStandard}
        />
      ))}

      {/* ── Grand total summary ── */}
      <div
        className={cn(
          "rounded-lg border px-3 py-3",
          isDark
            ? "border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/5"
            : "border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-teal-500/5",
        )}
      >
        <div className={cn(CPQ_BREAKDOWN_ROW, "text-sm")}>
          <span className={cn("font-bold min-w-0 break-words", isDark ? "text-white" : "text-foreground")}>
            Total mensual
          </span>
          <AmountCell
            clp={data.grandTotal}
            data={data}
            isDark={isDark}
            size="sm"
            primaryClassName="text-emerald-500 font-bold"
          />
        </div>
        <div className={cn("text-xs mt-1", isDark ? "text-zinc-500" : "text-muted-foreground")}>
          Valores netos · IVA se factura según ley vigente
        </div>
      </div>
    </div>
  );
}

/* ── Position card ── */

function PositionCard({
  pos,
  data,
  isDark,
  monthlyHours,
}: {
  pos: PositionBreakdownItem;
  data: QuoteBreakdownData;
  isDark: boolean;
  monthlyHours: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const rowCls = cn(CPQ_BREAKDOWN_ROW, "text-xs py-0.5");
  const labelCls = cn("text-xs min-w-0 break-words", isDark ? "text-zinc-400" : "text-muted-foreground");

  const imposiciones = pos.sisEmployer + pos.afcEmployer + pos.mutualEmployer;
  const provisiones = pos.vacationProvision + pos.severanceProvision;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-border bg-muted/10",
      )}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full text-left px-3 py-3 flex flex-col gap-2 transition-colors",
          isDark ? "hover:bg-white/[0.03]" : "hover:bg-muted/30",
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-start w-full">
          <div className="min-w-0">
            <div className={cn("text-sm font-semibold break-words", isDark ? "text-white" : "text-foreground")}>
              {pos.name}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span
                className={cn(
                  "flex items-center gap-1 text-sm",
                  isDark ? "text-zinc-400" : "text-muted-foreground",
                )}
              >
                <Users className="h-3 w-3" />
                {pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""}
                {pos.numPuestos > 1 && ` (${pos.numGuards}×${pos.numPuestos} puestos)`}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-sm",
                  isDark ? "text-zinc-400" : "text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" />
                <CpqDualCurrencyAmount
                  clp={pos.hourlyRateSale}
                  currency={data.currency}
                  ufValue={data.ufValue}
                  size="xs"
                  isDark={isDark}
                  suffix="/hr"
                  inline
                  primaryClassName={isDark ? "text-zinc-400" : "text-muted-foreground"}
                  secondaryClassName="text-[9px] opacity-70"
                />
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <AmountCell
              clp={pos.salePrice}
              data={data}
              isDark={isDark}
              size="md"
              primaryClassName="text-emerald-500 font-bold"
            />
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                isDark ? "text-zinc-500" : "text-muted-foreground",
                expanded ? "rotate-180" : "",
              )}
            />
          </div>
        </div>

        {pos.netSalaryPerGuard != null && pos.netSalaryPerGuard > 0 ? (
          <div
            className={cn(
              "rounded-lg border px-2.5 py-2 w-full",
              isDark ? "border-sky-500/25 bg-sky-500/[0.07]" : "border-sky-500/30 bg-sky-500/5",
            )}
          >
            <p className={cn("text-sm font-semibold uppercase tracking-wide", isDark ? "text-sky-300" : "text-sky-700")}>
              Sueldo líquido estimado
            </p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <span className={cn("text-sm", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Por guardia / mes
              </span>
              <CpqDualCurrencyAmount
                clp={pos.netSalaryPerGuard}
                currency={data.currency}
                ufValue={data.ufValue}
                size="md"
                isDark={isDark}
                primaryClassName={isDark ? "text-sky-100" : "text-sky-900 dark:text-sky-100"}
              />
            </div>
            {pos.totalGuardsInPosition > 1 && (
              <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-1.5 border-t border-sky-500/20">
                <span className={cn("text-sm", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                  Total puesto ({pos.totalGuardsInPosition} guardias)
                </span>
                <CpqDualCurrencyAmount
                  clp={pos.netSalaryPerGuard * pos.totalGuardsInPosition}
                  currency={data.currency}
                  ufValue={data.ufValue}
                  size="sm"
                  isDark={isDark}
                  primaryClassName={isDark ? "text-sky-200" : "text-sky-800 dark:text-sky-200"}
                />
              </div>
            )}
          </div>
        ) : (
          <p className={cn("text-sm leading-snug", isDark ? "text-amber-400/90" : "text-amber-700")}>
            Sueldo líquido: no hay estimación en este puesto. Si la cotización está bloqueada, el valor quedó al enviarla; si falta, al desbloquear usa Recalcular en el puesto.
          </p>
        )}
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div
          className={cn(
            "border-t px-3 pb-3 pt-2",
            isDark ? "border-white/[0.06]" : "border-border",
          )}
        >
          {/* Labor breakdown */}
          <div className="space-y-0.5 mb-2">
            <div className={cn("text-xs font-semibold uppercase tracking-wide mb-1.5", isDark ? "text-blue-400" : "text-blue-600")}>
              Mano de obra ({pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""})
            </div>

            {pos.totalImponible > 0 && (
              <div className={rowCls}>
                <span className={labelCls}>Sueldo imponible (base + gratif.)</span>
                <AmountCell
                  clp={pos.totalImponible}
                  data={data}
                  isDark={isDark}
                  primaryClassName={isDark ? "text-zinc-300" : "text-foreground"}
                />
              </div>
            )}
            {imposiciones > 0 && (
              <>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>SIS empleador</span>
                  <AmountCell
                    clp={pos.sisEmployer}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-300/70" : "text-foreground/70"}
                  />
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>AFC empleador</span>
                  <AmountCell
                    clp={pos.afcEmployer}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-300/70" : "text-foreground/70"}
                  />
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>Mutual / Acc. trabajo</span>
                  <AmountCell
                    clp={pos.mutualEmployer}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-300/70" : "text-foreground/70"}
                  />
                </div>
              </>
            )}
            {provisiones > 0 && (
              <>
                <div
                  className={cn(
                    "border-t mt-1 pt-1",
                    isDark ? "border-white/[0.06]" : "border-border",
                  )}
                />
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>Prov. vacaciones</span>
                  <AmountCell
                    clp={pos.vacationProvision}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-300/70" : "text-foreground/70"}
                  />
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>Prov. finiquito</span>
                  <AmountCell
                    clp={pos.severanceProvision}
                    data={data}
                    isDark={isDark}
                    primaryClassName={isDark ? "text-zinc-300/70" : "text-foreground/70"}
                  />
                </div>
              </>
            )}

            {/* Labor subtotal */}
            <div
              className={cn(
                CPQ_BREAKDOWN_ROW,
                "text-xs border-t mt-1 pt-1.5",
                isDark ? "border-blue-500/20" : "border-blue-500/30",
              )}
            >
              <span className={cn("font-semibold min-w-0 break-words", isDark ? "text-blue-400" : "text-blue-600")}>
                Total costo empleador
              </span>
              <AmountCell
                clp={pos.totalLaborCost}
                data={data}
                isDark={isDark}
                primaryClassName={isDark ? "text-blue-300" : "text-blue-700 font-semibold"}
              />
            </div>
          </div>

          {/* Pricing bridge: from cost to sale price */}
          <div
            className={cn(
              "rounded-lg border px-2.5 py-2 mt-2 space-y-1",
              isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-500/20 bg-emerald-500/5",
            )}
          >
            <div className={cn("text-xs font-semibold uppercase tracking-wide", isDark ? "text-emerald-500" : "text-emerald-600")}>
              Precio de venta
            </div>
            <div className="space-y-0.5">
              <div className={rowCls}>
                <span className={labelCls}>Costo de empleador</span>
                <AmountCell
                  clp={pos.totalLaborCost}
                  data={data}
                  isDark={isDark}
                  primaryClassName={isDark ? "text-zinc-300" : "text-foreground"}
                />
              </div>
              <div className="py-0.5">
                <span
                  className={cn(
                    "text-xs block min-w-0 break-words",
                    isDark ? "text-emerald-500/60" : "text-emerald-600/70",
                  )}
                >
                  + Costos adicionales prorrateados + margen + financiero
                </span>
              </div>
            </div>
            <div className={cn(CPQ_BREAKDOWN_ROW, "text-xs border-t pt-1.5", isDark ? "border-emerald-500/20" : "border-emerald-500/30")}>
              <span className={cn("font-bold min-w-0 break-words", isDark ? "text-emerald-400" : "text-emerald-600")}>
                Precio venta puesto
              </span>
              <AmountCell
                clp={pos.salePrice}
                data={data}
                isDark={isDark}
                primaryClassName="text-emerald-500 font-bold"
              />
            </div>
          </div>

          {/* Hourly rate */}
          <div
            className={cn(
              CPQ_BREAKDOWN_ROW,
              "mt-2 px-1 py-1.5 rounded-lg text-xs",
              isDark ? "bg-white/[0.03]" : "bg-muted/30",
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className={cn("h-3.5 w-3.5 shrink-0", isDark ? "text-zinc-400" : "text-muted-foreground")} />
              <span className={cn("text-sm break-words", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Valor hora de venta ({monthlyHours}h/mes)
              </span>
            </div>
            <div className={cpqBreakdownAmount()}>
              <CpqDualCurrencyAmount
                clp={pos.hourlyRateSale}
                currency={data.currency}
                ufValue={data.ufValue}
                size="sm"
                isDark={isDark}
                suffix="/hr"
                primaryClassName={isDark ? "text-emerald-400" : "text-emerald-600 font-bold"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
