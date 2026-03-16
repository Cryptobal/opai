"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { Position } from "./types";
import { formatHorario, formatWeekdays } from "./types";

interface ProposalPuestosProps {
  positions: Position[];
  totalGuards: number;
  monthlyCost: number;
  currency: string;
  sectionNumber: number;
  className?: string;
}

export function ProposalPuestos({
  positions,
  totalGuards,
  monthlyCost,
  currency,
  sectionNumber,
  className,
}: ProposalPuestosProps) {
  if (positions.length === 0) return null;

  const currencyKey = currency === "UF" ? "UF" : "CLP";
  const fmt = (v: number) => formatCurrency(v, currencyKey);

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3", className)}>
      <h3 className="text-xl font-bold text-white">
        <span className="text-teal-400">{sectionNumber}.</span> Puestos de Trabajo ·{" "}
        <span className="text-slate-300">{totalGuards} guardia{totalGuards !== 1 ? "s" : ""}</span>
      </h3>

      {/* Mobile: card view */}
      <div className="md:hidden space-y-2">
        {positions.map((pos) => (
          <div key={pos.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
            <div className="text-sm font-medium text-slate-200">{pos.customName ?? `Puesto ${pos.numPuestos ?? ""}`}</div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {pos.numGuards ?? "—"} guardia{(pos.numGuards ?? 0) !== 1 ? "s" : ""} · {pos.numPuestos ?? 1} puesto{(pos.numPuestos ?? 1) !== 1 ? "s" : ""}
              </span>
              <span className="text-emerald-400 font-mono font-semibold">
                {fmt(pos.displayPrice ?? pos.monthlyPositionCost)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              {formatHorario(pos.startTime, pos.endTime)} · {formatWeekdays(pos.weekdays)}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs min-w-[540px]">
          <thead>
            <tr className="text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <th className="text-left py-2 pr-3 font-medium">Puesto</th>
              <th className="text-center py-2 pr-3 font-medium">G</th>
              <th className="text-center py-2 pr-3 font-medium">Cant</th>
              <th className="text-left py-2 pr-3 font-medium">Días</th>
              <th className="text-left py-2 pr-3 font-medium">Horario</th>
              <th className="text-right py-2 font-medium">Valor Mensual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {positions.map((pos) => (
              <tr key={pos.id}>
                <td className="py-2 pr-3 text-slate-200 font-medium">
                  {pos.customName ?? `Puesto ${pos.numPuestos ?? ""}`}
                </td>
                <td className="py-2 pr-3 text-center text-slate-300">{pos.numGuards ?? "—"}</td>
                <td className="py-2 pr-3 text-center text-slate-300">{pos.numPuestos ?? 1}</td>
                <td className="py-2 pr-3 text-slate-400">{formatWeekdays(pos.weekdays)}</td>
                <td className="py-2 pr-3 text-slate-400">{formatHorario(pos.startTime, pos.endTime)}</td>
                <td className="py-2 text-right text-emerald-400 font-mono font-semibold">
                  {fmt(pos.displayPrice ?? pos.monthlyPositionCost)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600">
              <td colSpan={5} className="py-2.5 text-sm font-bold text-white">
                PRECIO VENTA MENSUAL NETO
              </td>
              <td className="py-2.5 text-right text-sm font-bold text-emerald-400 font-mono">
                {fmt(monthlyCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile total */}
      <div className="md:hidden flex items-center justify-between rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
        <span className="text-xs font-bold text-white">PRECIO VENTA MENSUAL NETO</span>
        <span className="text-sm font-bold text-emerald-400 font-mono">{fmt(monthlyCost)}</span>
      </div>

      <p className="text-[10px] text-slate-500 text-right">
        Valores netos. IVA se factura según ley vigente.
      </p>
    </div>
  );
}
