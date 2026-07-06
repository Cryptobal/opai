"use client";

import { ChevronDown } from "lucide-react";

/** Detalles técnicos colapsables (fechas) de la columna "Sobre el negocio". */
function formatTechDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DealAboutTechDetails({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  return (
    <details className="group border-t border-border/50 pt-2">
      <summary className="flex cursor-pointer list-none select-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
        Detalles técnicos
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-3">Creación</dt>
          <dd className="text-right tabular-nums">{formatTechDate(createdAt)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-3">Modificación</dt>
          <dd className="text-right tabular-nums">{formatTechDate(updatedAt)}</dd>
        </div>
      </dl>
    </details>
  );
}
