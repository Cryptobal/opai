"use client";

import { ChevronRight, ShieldCheck, AlertTriangle, Shield } from "lucide-react";
import type { GuardiaSummary } from "@/lib/portal-cliente-guardias";

interface Props {
  guardia: GuardiaSummary;
  onOpen: (id: string) => void;
}

export function EquipoGuardiaRow({ guardia, onOpen }: Props) {
  const { os10Estado, resumen } = guardia;
  const hasAlerts =
    resumen.vencidos > 0 || resumen.porVencer > 0 || os10Estado === "vencido";

  return (
    <button
      onClick={() => onOpen(guardia.id)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
    >
      <div className="h-9 w-9 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-teal-300">
          {guardia.iniciales}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{guardia.nombre}</p>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Os10Pill estado={os10Estado} />
          {resumen.vencidos > 0 && (
            <span className="text-red-400">
              {resumen.vencidos} doc{resumen.vencidos > 1 ? "s" : ""} vencido
              {resumen.vencidos > 1 ? "s" : ""}
            </span>
          )}
          {resumen.porVencer > 0 && resumen.vencidos === 0 && (
            <span className="text-amber-400">
              {resumen.porVencer} por vencer
            </span>
          )}
        </div>
      </div>
      {hasAlerts && (
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
      )}
      <ChevronRight className="h-4 w-4 text-zinc-500 flex-shrink-0" />
    </button>
  );
}

function Os10Pill({ estado }: { estado: GuardiaSummary["os10Estado"] }) {
  if (estado === "vigente") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
        <ShieldCheck className="h-3 w-3" />
        OS-10 al día
      </span>
    );
  }
  if (estado === "por_vencer") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
        <Shield className="h-3 w-3" />
        Por vencer
      </span>
    );
  }
  if (estado === "vencido") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
        <Shield className="h-3 w-3" />
        Vencido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
      <Shield className="h-3 w-3" />
      Pendiente
    </span>
  );
}
