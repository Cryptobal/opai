"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { EquipoGuardiaRow } from "./EquipoGuardiaRow";
import type { GuardiaSummary } from "@/lib/portal-cliente-guardias";

interface Grupo {
  installation: { id: string; name: string };
  guardias: GuardiaSummary[];
  resumen: {
    total: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
  };
}

interface Props {
  grupo: Grupo;
  defaultOpen?: boolean;
  onOpenGuardia: (id: string) => void;
}

export function EquipoGrupoInstalacion({
  grupo,
  defaultOpen = true,
  onOpenGuardia,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { installation, guardias, resumen } = grupo;
  const hasAlerts = resumen.os10PorVencer > 0 || resumen.os10Vencido > 0;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-lg bg-teal-600/20 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-4 w-4 text-teal-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{installation.name}</p>
          <p className="text-xs text-zinc-500">
            {resumen.total} guardia{resumen.total !== 1 ? "s" : ""}
            {hasAlerts ? (
              <>
                {" · "}
                {resumen.os10Vencido > 0 && (
                  <span className="text-red-400">
                    {resumen.os10Vencido} vencido
                    {resumen.os10Vencido > 1 ? "s" : ""}
                  </span>
                )}
                {resumen.os10Vencido > 0 && resumen.os10PorVencer > 0 && " · "}
                {resumen.os10PorVencer > 0 && (
                  <span className="text-amber-400">
                    {resumen.os10PorVencer} por vencer
                  </span>
                )}
              </>
            ) : null}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3 py-3 space-y-1.5">
          {guardias.length === 0 ? (
            <p className="text-xs text-zinc-500 px-2 py-4 text-center">
              Sin guardias asignados a esta instalación.
            </p>
          ) : (
            guardias.map((g) => (
              <EquipoGuardiaRow
                key={g.id}
                guardia={g}
                onOpen={onOpenGuardia}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
