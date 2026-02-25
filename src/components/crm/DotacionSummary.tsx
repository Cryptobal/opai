"use client";

import { Users, Briefcase, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type DotacionDisplayItem = {
  puesto: string;
  cantidad: number;
  numPuestos?: number;
  dias?: string[];
  horaInicio?: string;
  horaFin?: string;
};

/**
 * DotacionSummary — Resumen read-only de dotación solicitada.
 * Reutilizable en el listado (list view) y en el detalle de leads.
 */
export function DotacionSummary({
  dotacion,
  totalGuards,
}: {
  dotacion: DotacionDisplayItem[];
  totalGuards: number;
}) {
  if (!dotacion || dotacion.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dotación solicitada
        </span>
        {totalGuards > 0 && (
          <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0">
            {totalGuards} guardia{totalGuards > 1 ? "s" : ""} total
          </Badge>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {dotacion.map((d, i) => (
          <div
            key={i}
            className="px-3 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">
                {d.puesto}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pl-5 sm:pl-0">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3 shrink-0" />
                {d.cantidad} guardia{d.cantidad > 1 ? "s" : ""}
                {d.numPuestos != null && d.numPuestos > 0 && (
                  <> x {d.numPuestos} puesto{d.numPuestos > 1 ? "s" : ""}</>
                )}
              </span>
              {d.horaInicio && d.horaFin && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {d.horaInicio} – {d.horaFin}
                </span>
              )}
              {d.dias && d.dias.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {d.dias.length === 7
                    ? "Todos los días"
                    : d.dias.join(", ")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
