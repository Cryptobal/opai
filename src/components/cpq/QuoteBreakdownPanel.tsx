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

/* ── Format helpers ── */

function fmtCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtUF(n: number) {
  return `${n.toFixed(2)} UF`;
}

function clpToUf(clp: number, uf: number) {
  return uf > 0 ? clp / uf : 0;
}

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

  const fmt = (clp: number) => {
    if (data.currency === "UF" && data.ufValue && data.ufValue > 0) {
      return fmtUF(clpToUf(clp, data.ufValue));
    }
    return fmtCLP(clp);
  };

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
        <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 mb-1">
          Precio Venta Mensual
        </div>
        <div className={cn("font-bold text-2xl", isDark ? "text-white" : "text-foreground")}>
          {fmt(data.grandTotal)}
        </div>
        {data.currency !== "UF" && data.ufValue && data.ufValue > 0 && (
          <div className="text-sm text-emerald-400/70 mt-0.5">
            {fmtUF(clpToUf(data.grandTotal, data.ufValue))}
          </div>
        )}
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
        <TotalView data={data} fmt={fmt} isDark={isDark} />
      ) : (
        <PorPuestoView data={data} fmt={fmt} isDark={isDark} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Total View
   ══════════════════════════════════════════════════════════════ */

interface TotalViewProps {
  data: QuoteBreakdownData;
  fmt: (n: number) => string;
  isDark: boolean;
}

function TotalView({ data, fmt, isDark }: TotalViewProps) {
  const [laborExpanded, setLaborExpanded] = useState(false);

  const grandTotal = data.grandTotal;

  const pct = (n: number) =>
    grandTotal > 0 ? `${((n / grandTotal) * 100).toFixed(0)}%` : "0%";

  const rowCls = cn(
    "flex items-center justify-between text-xs py-1",
    isDark ? "text-zinc-300" : "text-foreground/80",
  );
  const labelCls = cn("text-xs", isDark ? "text-zinc-400" : "text-muted-foreground");
  const amountCls = cn("font-mono text-xs font-medium", isDark ? "text-zinc-200" : "text-foreground");

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
    <div className="space-y-2">
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
                "w-full flex items-center justify-between px-3 py-2",
                isLabor ? "cursor-pointer" : "cursor-default",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", section.color)} />
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    isDark ? "text-zinc-300" : "text-foreground",
                  )}
                >
                  {section.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px]", isDark ? "text-zinc-500" : "text-muted-foreground")}>
                  {pct(sectionTotal)}
                </span>
                <span className={cn("font-mono text-xs font-semibold", isDark ? "text-zinc-200" : "text-foreground")}>
                  {fmt(sectionTotal)}
                </span>
                {isLabor && (
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
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
                  <span className={amountCls}>{fmt(laborBreakdown.totalImponible)}</span>
                </div>
                <div className={rowCls}>
                  <span className={labelCls}>Imposiciones empleador</span>
                  <span className={amountCls}>{fmt(laborBreakdown.imposiciones)}</span>
                </div>
                <div className={rowCls}>
                  <span className={labelCls}>Provisiones (vacac. + finiquito)</span>
                  <span className={amountCls}>{fmt(laborBreakdown.provisiones)}</span>
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
                    <span className={amountCls}>{fmt(item.amount)}</span>
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
          "flex items-center justify-between px-3 py-1.5 rounded-lg",
          isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-muted border border-border",
        )}
      >
        <span className={cn("text-xs font-semibold", isDark ? "text-zinc-400" : "text-muted-foreground")}>
          Subtotal costos base
        </span>
        <span className={cn("font-mono text-xs font-semibold", isDark ? "text-zinc-300" : "text-foreground")}>
          {fmt(data.subtotalBase)}
        </span>
      </div>

      {/* ── Margin ── */}
      <div
        className={cn(
          "rounded-lg border px-3 py-2 space-y-1",
          isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-500/30 bg-emerald-500/5",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
            Margen comercial
          </span>
          <span className="text-[10px] text-emerald-500/70">{data.marginPct}% sobre precio venta</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-muted-foreground")}>
            Margen mensual
          </span>
          <span className="font-mono text-xs font-semibold text-emerald-500">
            {fmt(data.marginAmount)}
          </span>
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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-500/80">
            Costo Financiero
          </span>
          {data.financial > 0 && (
            <div className="flex items-center justify-between">
              <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Financiero ({data.financialRatePct}%)
              </span>
              <span className={cn("font-mono text-xs font-medium", isDark ? "text-zinc-300" : "text-foreground")}>
                {fmt(data.financial)}
              </span>
            </div>
          )}
          {data.policy > 0 && (
            <div className="flex items-center justify-between">
              <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Póliza ({data.policyRatePct}%)
              </span>
              <span className={cn("font-mono text-xs font-medium", isDark ? "text-zinc-300" : "text-foreground")}>
                {fmt(data.policy)}
              </span>
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
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-foreground")}>
            Precio venta mensual
          </span>
          <span className="font-mono text-sm font-bold text-emerald-500">
            {fmt(data.grandTotal)}
          </span>
        </div>
        {data.additionalLines > 0 && (
          <div
            className={cn(
              "flex items-center justify-between text-xs mt-1 pt-1 border-t",
              isDark ? "border-white/[0.06] text-zinc-400" : "border-border text-muted-foreground",
            )}
          >
            <span>Incluye líneas adicionales</span>
            <span className="font-mono">{fmt(data.additionalLines)}</span>
          </div>
        )}
        <div className={cn("text-[10px] mt-1.5", isDark ? "text-zinc-500" : "text-muted-foreground")}>
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
  fmt: (n: number) => string;
  isDark: boolean;
}

function PorPuestoView({ data, fmt, isDark }: PorPuestoViewProps) {
  return (
    <div className="space-y-2">
      {data.positions.map((pos) => (
        <PositionCard key={pos.id} pos={pos} fmt={fmt} isDark={isDark} monthlyHours={data.monthlyHoursStandard} />
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
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-foreground")}>
            Total mensual
          </span>
          <span className="font-mono text-sm font-bold text-emerald-500">
            {fmt(data.grandTotal)}
          </span>
        </div>
        <div className={cn("text-[10px] mt-1", isDark ? "text-zinc-500" : "text-muted-foreground")}>
          Valores netos · IVA se factura según ley vigente
        </div>
      </div>
    </div>
  );
}

/* ── Position card ── */

function PositionCard({
  pos,
  fmt,
  isDark,
  monthlyHours,
}: {
  pos: PositionBreakdownItem;
  fmt: (n: number) => string;
  isDark: boolean;
  monthlyHours: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const rowCls = cn(
    "flex items-center justify-between text-xs py-0.5",
  );
  const labelCls = cn("text-xs", isDark ? "text-zinc-400" : "text-muted-foreground");
  const amountCls = cn("font-mono text-xs", isDark ? "text-zinc-300" : "text-foreground");
  const boldCls = cn("font-mono text-xs font-semibold", isDark ? "text-zinc-100" : "text-foreground");

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
          "w-full text-left px-3 py-3 flex items-start gap-3 transition-colors",
          isDark ? "hover:bg-white/[0.03]" : "hover:bg-muted/30",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-semibold truncate", isDark ? "text-white" : "text-foreground")}>
            {pos.name}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span
              className={cn(
                "flex items-center gap-1 text-[11px]",
                isDark ? "text-zinc-400" : "text-muted-foreground",
              )}
            >
              <Users className="h-3 w-3" />
              {pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""}
              {pos.numPuestos > 1 && ` (${pos.numGuards}×${pos.numPuestos} puestos)`}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 text-[11px]",
                isDark ? "text-zinc-400" : "text-muted-foreground",
              )}
            >
              <Clock className="h-3 w-3" />
              {fmtCLP(Math.round(pos.hourlyRateSale))}/hr
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-mono text-sm font-bold text-emerald-500">
            {fmt(pos.salePrice)}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isDark ? "text-zinc-500" : "text-muted-foreground",
              expanded ? "rotate-180" : "",
            )}
          />
        </div>
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
            <div className={cn("text-[10px] font-semibold uppercase tracking-wide mb-1.5", isDark ? "text-blue-400" : "text-blue-600")}>
              Mano de obra ({pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""})
            </div>

            {pos.totalImponible > 0 && (
              <div className={rowCls}>
                <span className={labelCls}>Sueldo imponible (base + gratif.)</span>
                <span className={amountCls}>{fmt(pos.totalImponible)}</span>
              </div>
            )}
            {imposiciones > 0 && (
              <>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>SIS empleador</span>
                  <span className={cn(amountCls, "opacity-70")}>{fmt(pos.sisEmployer)}</span>
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>AFC empleador</span>
                  <span className={cn(amountCls, "opacity-70")}>{fmt(pos.afcEmployer)}</span>
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>Mutual / Acc. trabajo</span>
                  <span className={cn(amountCls, "opacity-70")}>{fmt(pos.mutualEmployer)}</span>
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
                  <span className={cn(amountCls, "opacity-70")}>{fmt(pos.vacationProvision)}</span>
                </div>
                <div className={rowCls}>
                  <span className={cn(labelCls, "pl-2 italic")}>Prov. finiquito</span>
                  <span className={cn(amountCls, "opacity-70")}>{fmt(pos.severanceProvision)}</span>
                </div>
              </>
            )}

            {/* Labor subtotal */}
            <div
              className={cn(
                "flex items-center justify-between border-t mt-1 pt-1.5",
                isDark ? "border-blue-500/20" : "border-blue-500/30",
              )}
            >
              <span className={cn("text-xs font-semibold", isDark ? "text-blue-400" : "text-blue-600")}>
                Total costo empleador
              </span>
              <span className={cn("font-mono text-xs font-semibold", isDark ? "text-blue-300" : "text-blue-700")}>
                {fmt(pos.totalLaborCost)}
              </span>
            </div>
          </div>

          {/* Pricing bridge: from cost to sale price */}
          <div
            className={cn(
              "rounded-lg border px-2.5 py-2 mt-2 space-y-1",
              isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-500/20 bg-emerald-500/5",
            )}
          >
            <div className={cn("text-[10px] font-semibold uppercase tracking-wide", isDark ? "text-emerald-500" : "text-emerald-600")}>
              Precio de venta
            </div>
            <div className="space-y-0.5">
              <div className={rowCls}>
                <span className={labelCls}>Costo de empleador</span>
                <span className={amountCls}>{fmt(pos.totalLaborCost)}</span>
              </div>
              <div className={rowCls}>
                <span className={cn("text-[10px]", isDark ? "text-emerald-500/60" : "text-emerald-600/70")}>
                  + Costos adicionales prorrateados + margen + financiero
                </span>
              </div>
            </div>
            <div className={cn("flex items-center justify-between border-t pt-1.5", isDark ? "border-emerald-500/20" : "border-emerald-500/30")}>
              <span className={cn("text-xs font-bold", isDark ? "text-emerald-400" : "text-emerald-600")}>
                Precio venta puesto
              </span>
              <span className="font-mono text-xs font-bold text-emerald-500">
                {fmt(pos.salePrice)}
              </span>
            </div>
          </div>

          {/* Hourly rate */}
          <div
            className={cn(
              "flex items-center justify-between mt-2 px-1 py-1.5 rounded-lg",
              isDark ? "bg-white/[0.03]" : "bg-muted/30",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Clock className={cn("h-3.5 w-3.5", isDark ? "text-zinc-400" : "text-muted-foreground")} />
              <span className={cn("text-[11px]", isDark ? "text-zinc-400" : "text-muted-foreground")}>
                Valor hora de venta ({monthlyHours}h/mes)
              </span>
            </div>
            <span className={cn("font-mono text-xs font-bold", isDark ? "text-emerald-400" : "text-emerald-600")}>
              {fmtCLP(Math.round(pos.hourlyRateSale))}/hr
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
