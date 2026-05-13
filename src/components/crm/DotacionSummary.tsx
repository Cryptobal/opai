"use client";

import {
  Users,
  Briefcase,
  Clock,
  Calendar,
  ShieldCheck,
  Sun,
  Moon,
  CalendarClock,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
};

type DotacionDisplayItem = {
  puesto: string;
  cantidad: number;
  numPuestos?: number;
  dias?: string[];
  horaInicio?: string;
  horaFin?: string;
  serviceGroupKey?: string;
  serviceGroupName?: string;
  serviceGroupPattern?: string;
  serviceGroupIcon?: string;
  serviceGroupOrder?: number;
};

function ShiftRow({ d }: { d: DotacionDisplayItem }) {
  return (
    <div className="px-3 py-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
      <div className="flex items-center gap-1.5 min-w-0">
        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{d.puesto}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pl-5 sm:pl-0">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" />
          {d.cantidad} guardia{d.cantidad > 1 ? "s" : ""}
          {d.numPuestos != null && d.numPuestos > 0 && (
            <>
              {" "}
              x {d.numPuestos} puesto{d.numPuestos > 1 ? "s" : ""}
            </>
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
            {d.dias.length === 7 ? "Todos los días" : d.dias.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * DotacionSummary — Resumen read-only de dotación solicitada.
 * Renderiza agrupado por servicio cuando los items traen serviceGroupKey;
 * para items sin grupo, los muestra en una sección "Sin agrupar" al final.
 */
export function DotacionSummary({
  dotacion,
  totalGuards,
}: {
  dotacion: DotacionDisplayItem[];
  totalGuards: number;
}) {
  if (!dotacion || dotacion.length === 0) return null;

  const groups = new Map<
    string,
    {
      name: string;
      pattern?: string;
      icon?: string;
      order: number;
      items: DotacionDisplayItem[];
    }
  >();
  const ungrouped: DotacionDisplayItem[] = [];
  for (const d of dotacion) {
    if (d.serviceGroupKey) {
      const g = groups.get(d.serviceGroupKey) ?? {
        name: d.serviceGroupName || "Servicio",
        pattern: d.serviceGroupPattern,
        icon: d.serviceGroupIcon,
        order: d.serviceGroupOrder ?? 0,
        items: [],
      };
      g.items.push(d);
      groups.set(d.serviceGroupKey, g);
    } else {
      ungrouped.push(d);
    }
  }
  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );

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
        {sortedGroups.map((g, gi) => {
          const Icon = ICONS[g.icon || "ShieldCheck"] || ShieldCheck;
          const gGuards = g.items.reduce(
            (s, d) => s + d.cantidad * (d.numPuestos || 1),
            0
          );
          return (
            <div key={gi}>
              <div className="px-3 py-2 bg-muted/15 flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">{g.name}</span>
                {g.pattern && (
                  <Badge variant="outline" className="text-[10px]">
                    {g.pattern.replace("-", "/")}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">{gGuards}g</span>
              </div>
              <div className="divide-y divide-border/40">
                {g.items.map((d, i) => (
                  <ShiftRow key={i} d={d} />
                ))}
              </div>
            </div>
          );
        })}
        {ungrouped.length > 0 && (
          <div>
            {sortedGroups.length > 0 && (
              <div className="px-3 py-1 bg-muted/10 text-[10px] uppercase tracking-wide text-muted-foreground">
                Sin agrupar
              </div>
            )}
            <div className="divide-y divide-border/40">
              {ungrouped.map((d, i) => (
                <ShiftRow key={i} d={d} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
