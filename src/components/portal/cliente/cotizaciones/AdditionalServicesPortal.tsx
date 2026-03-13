"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { AdditionalLine } from "./types";

interface AdditionalServicesPortalProps {
  lines: AdditionalLine[];
  currency: string;
  className?: string;
}

const TIPO_LABELS: Record<string, string> = {
  servicio: "Servicio",
  arriendo: "Arriendo",
  equipamiento: "Equipamiento",
  inversion: "Inversión",
  otro: "Otro",
};

const RECURRENCIA_SUFFIX: Record<string, string> = {
  mensual: "/mes",
  trimestral: "/trimestre",
  anual: "/año",
  unica: " (pago único)",
};

export function AdditionalServicesPortal({
  lines,
  currency,
  className,
}: AdditionalServicesPortalProps) {
  if (!lines.length) return null;

  const fmt = (v: number) => formatCurrency(v, currency === "UF" ? "UF" : "CLP");

  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
        Servicios adicionales
      </h4>
      <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] overflow-hidden">
        {lines.map((line) => {
          const tipoLabel = TIPO_LABELS[line.tipo ?? "servicio"] ?? line.tipo ?? "Servicio";
          const suffix = RECURRENCIA_SUFFIX[line.recurrencia ?? "mensual"] ?? "/mes";
          return (
            <div
              key={line.id}
              className="flex items-start justify-between gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-200 truncate">{line.nombre}</span>
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400">
                    {tipoLabel}
                  </span>
                </div>
                {line.descripcion && (
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{line.descripcion}</p>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-teal-400 whitespace-nowrap">
                {fmt(line.precio)}{suffix}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
