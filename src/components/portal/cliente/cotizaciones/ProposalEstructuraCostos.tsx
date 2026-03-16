"use client";

import { useState } from "react";
import { ChevronDown, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteBreakdownData } from "@/types/cpq-breakdown";

interface ProposalEstructuraCostosProps {
  breakdown: QuoteBreakdownData;
  sectionNumber: number;
  defaultOpen?: boolean;
  className?: string;
}

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

export function ProposalEstructuraCostos({
  breakdown,
  sectionNumber,
  defaultOpen = true,
  className,
}: ProposalEstructuraCostosProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const fmt = (n: number) => {
    if (breakdown.currency === "UF" && breakdown.ufValue && breakdown.ufValue > 0) {
      return fmtUF(n / breakdown.ufValue);
    }
    return fmtCLP(n);
  };

  const directCostsTotal =
    breakdown.holidayAdjustment +
    breakdown.uniforms +
    breakdown.exams +
    breakdown.meals;

  const indirectCostsTotal =
    breakdown.equipment +
    breakdown.transport +
    breakdown.vehicles +
    breakdown.infrastructure +
    breakdown.systems;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 overflow-hidden", className)}>
      {/* Header — clickable to toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-teal-400" />
          <h3 className="text-xl font-bold text-white">
            <span className="text-teal-400">{sectionNumber}.</span> Estructura de Costos
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium">
            Transparente
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-slate-500 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="px-4 py-4 bg-slate-800/30 space-y-3">
          {/* Mano de Obra */}
          <CostSection
            title="Mano de Obra"
            total={fmt(breakdown.totalLaborCost)}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
          >
            {breakdown.positions.map((pos) => (
              <div key={pos.id} className="space-y-0.5">
                <CostRow
                  label={`${pos.name} (${pos.totalGuardsInPosition}g)`}
                  value={fmt(pos.totalLaborCost)}
                  bold
                />
                <CostRow label="Sueldo base" value={fmt(pos.baseSalary)} indent />
                {pos.gratification > 0 && (
                  <CostRow label="Gratificación legal" value={fmt(pos.gratification)} indent />
                )}
              </div>
            ))}
          </CostSection>

          {/* Costos Directos */}
          {directCostsTotal > 0 && (
            <CostSection
              title="Costos Directos"
              total={fmt(directCostsTotal)}
              color="text-teal-400"
              bgColor="bg-teal-500/10"
            >
              {breakdown.holidayAdjustment > 0 && (
                <CostRow label="Ajuste feriados legales" value={fmt(breakdown.holidayAdjustment)} />
              )}
              {breakdown.uniforms > 0 && (
                <CostRow label="Uniformes" value={fmt(breakdown.uniforms)} />
              )}
              {breakdown.exams > 0 && (
                <CostRow label="Exámenes médicos" value={fmt(breakdown.exams)} />
              )}
              {breakdown.meals > 0 && (
                <CostRow label="Alimentación" value={fmt(breakdown.meals)} />
              )}
            </CostSection>
          )}

          {/* Costos Indirectos */}
          {indirectCostsTotal > 0 && (
            <CostSection
              title="Costos Indirectos"
              total={fmt(indirectCostsTotal)}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            >
              {breakdown.equipment > 0 && (
                <CostRow label="Equipo operativo" value={fmt(breakdown.equipment)} />
              )}
              {breakdown.transport > 0 && (
                <CostRow label="Transporte" value={fmt(breakdown.transport)} />
              )}
              {breakdown.vehicles > 0 && (
                <CostRow label="Vehículos" value={fmt(breakdown.vehicles)} />
              )}
              {breakdown.infrastructure > 0 && (
                <CostRow label="Infraestructura" value={fmt(breakdown.infrastructure)} />
              )}
              {breakdown.systems > 0 && (
                <CostRow label="Sistemas" value={fmt(breakdown.systems)} />
              )}
            </CostSection>
          )}

          {/* Subtotal */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="text-xs font-semibold text-slate-400">Subtotal costos base</span>
            <span className="text-xs font-mono font-semibold text-slate-300">{fmt(breakdown.subtotalBase)}</span>
          </div>

          {/* Margin */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <span className="text-xs font-semibold text-emerald-400">
              Margen comercial ({breakdown.marginPct}% sobre precio venta)
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-400">{fmt(breakdown.marginAmount)}</span>
          </div>

          {/* Financial */}
          {breakdown.financial > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <span className="text-xs font-semibold text-orange-400">
                Costo financiero ({breakdown.financialRatePct}%)
              </span>
              <span className="text-xs font-mono font-semibold text-orange-400">{fmt(breakdown.financial)}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-600/20 border border-emerald-500/30">
            <span className="text-sm font-bold text-white">PRECIO VENTA MENSUAL NETO</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{fmt(breakdown.grandTotal)}</span>
          </div>

          {/* Valor Hora por Puesto */}
          {breakdown.positions.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                Valor Hora de Venta por Puesto
              </h4>
              {breakdown.positions.map((pos) => (
                <div
                  key={pos.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                  <span className="text-xs text-slate-300">
                    {pos.name}{" "}
                    <span className="text-slate-500">
                      ({pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""})
                    </span>
                  </span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {fmtCLP(Math.round(pos.hourlyRateSale))}/hr
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-500 text-right">
            Valores netos · IVA se factura según ley vigente
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Helper components ── */

function CostSection({
  title,
  total,
  color,
  bgColor,
  children,
}: {
  title: string;
  total: string;
  color: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
      <div className={cn("flex items-center justify-between px-3 py-2", bgColor)}>
        <span className={cn("text-xs font-bold uppercase tracking-wider", color)}>{title}</span>
        <span className={cn("text-xs font-mono font-bold", color)}>{total}</span>
      </div>
      <div className="px-3 py-2 space-y-0.5">{children}</div>
    </div>
  );
}

function CostRow({
  label,
  value,
  bold,
  indent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span
        className={cn(
          "text-xs",
          indent ? "pl-3 text-slate-500" : "text-slate-400",
          bold && "font-medium text-slate-300",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-mono",
          bold ? "font-medium text-slate-300" : "text-slate-500",
        )}
      >
        {value}
      </span>
    </div>
  );
}
