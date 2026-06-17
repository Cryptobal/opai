"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { LaborBreakdownPortal } from "./types";

interface ProposalManoDeObraProps {
  laborBreakdown: LaborBreakdownPortal;
  sectionNumber: number;
  currency?: string;
  ufValue?: number;
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

export function ProposalManoDeObra({
  laborBreakdown,
  sectionNumber,
  currency,
  ufValue,
  className,
}: ProposalManoDeObraProps) {
  const { positionDetails, totalGuardias, totalMensual } = laborBreakdown;
  if (!positionDetails || positionDetails.length === 0) return null;

  const fmt = (n: number) =>
    currency === "UF" && ufValue && ufValue > 0 ? fmtUF(n / ufValue) : fmtCLP(n);

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-4", className)}>
      <h3 className="text-xl font-bold text-white">
        <span className="text-status-info-fg">{sectionNumber}.</span> Detalle de Mano de Obra
      </h3>

      {positionDetails.map((pos, idx) => {
        const totalSocialCharges = pos.sisEmployer + pos.afcEmployer + pos.mutualEmployer;
        const perGuard = pos.totalGuardsInPosition > 0 ? pos.totalLaborCost / pos.totalGuardsInPosition : 0;

        return (
          <div key={idx} className="rounded-lg border border-white/[0.06] overflow-hidden">
            {/* Position header */}
            <div className="bg-white/[0.04] px-3 py-2 border-b border-white/[0.06]">
              <h4 className="text-sm font-semibold text-slate-200">
                {pos.name} · {pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? "s" : ""}
              </h4>
            </div>

            {/* Breakdown rows */}
            <div className="divide-y divide-slate-700/30">
              <Row label="Sueldo base imponible" value={fmt(pos.baseSalary / Math.max(1, pos.totalGuardsInPosition))} />
              <Row label="Gratificación legal" value={fmt(pos.gratification / Math.max(1, pos.totalGuardsInPosition))} />
              <Row label="Total haberes imponibles" value={fmt(pos.totalImponible / Math.max(1, pos.totalGuardsInPosition))} bold />
              <Row label="SIS" value={fmt(pos.sisEmployer / Math.max(1, pos.totalGuardsInPosition))} indent />
              <Row label="AFC" value={fmt(pos.afcEmployer / Math.max(1, pos.totalGuardsInPosition))} indent />
              <Row label="Mutual / Accidentes (Ley 16.744)" value={fmt(pos.mutualEmployer / Math.max(1, pos.totalGuardsInPosition))} indent />
              <Row label="Total cargas sociales empleador" value={fmt(totalSocialCharges / Math.max(1, pos.totalGuardsInPosition))} bold />
              {pos.vacationProvision > 0 && (
                <Row label="Provisión vacaciones" value={fmt(pos.vacationProvision / Math.max(1, pos.totalGuardsInPosition))} indent />
              )}
              {pos.severanceProvision > 0 && (
                <Row label="Provisión indemnización" value={fmt(pos.severanceProvision / Math.max(1, pos.totalGuardsInPosition))} indent />
              )}
              <Row label="Costo empresa por guardia" value={fmt(perGuard)} bold highlight />
            </div>
          </div>
        );
      })}

      {/* Totals */}
      <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-300">Total guardias</span>
          <span className="font-bold text-white">{totalGuardias}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-white">Total mensual mano de obra</span>
          <span className="font-bold text-status-ok-fg font-mono">{fmt(totalMensual)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  indent,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5",
        highlight && "bg-white/[0.04]",
      )}
    >
      <span
        className={cn(
          "text-xs",
          indent ? "pl-3 text-slate-500" : "text-slate-300",
          bold && "font-semibold text-slate-200",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-mono",
          bold ? "font-semibold text-slate-200" : "text-slate-400",
          highlight && "text-white font-bold",
        )}
      >
        {value}
      </span>
    </div>
  );
}
