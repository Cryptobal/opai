/**
 * Desglose visual de horas de un turno: horas efectivas/día, horas/semana y
 * horas extra, con semáforo de cumplimiento (Ley 21.561). Reutilizado por el
 * editor (variant="full"), el resumen colapsado y la grilla (variant="compact").
 */
"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JornadaAnalysis } from "@/lib/dt/jornada-calc";

type Nivel = "ok" | "warn" | "error";

function severidad(a: JornadaAnalysis): Nivel {
  if (a.alertas.some((x) => x.nivel === "error")) return "error";
  if (a.alertas.some((x) => x.nivel === "warn")) return "warn";
  return "ok";
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const TONE: Record<Nivel, string> = {
  ok: "text-muted-foreground",
  warn: "text-status-warn-fg",
  error: "text-destructive",
};

export function JornadaHoursChip({
  analysis,
  variant = "compact",
  className,
}: {
  analysis: JornadaAnalysis;
  variant?: "full" | "compact";
  className?: string;
}) {
  const nivel = severidad(analysis);
  const tone = TONE[nivel];
  const title = analysis.alertas.map((x) => x.msg).join(" · ") || undefined;
  const extra = analysis.horasExtraSemana > 0;

  if (variant === "compact") {
    // Resumen / grilla: "47.5h/sem" + badge de extra si aplica.
    return (
      <span
        title={title}
        className={cn("inline-flex items-center gap-1 font-mono text-xs", tone, className)}
      >
        {nivel !== "ok" && <AlertTriangle className="h-3 w-3" />}
        {fmt(analysis.horasSemana)}h/sem
        {extra && (
          <span className={cn("font-semibold", nivel === "ok" ? "text-status-warn-fg" : tone)}>
            +{fmt(analysis.horasExtraSemana)}h ex
          </span>
        )}
      </span>
    );
  }

  // Editor: desglose completo.
  return (
    <span
      title={title}
      className={cn("inline-flex flex-wrap items-center gap-x-1.5 text-xs", tone, className)}
    >
      {nivel !== "ok" && <AlertTriangle className="h-3 w-3 shrink-0" />}
      <span className="font-mono">{fmt(analysis.horasEfectivasDia)}h efec</span>
      <span className="opacity-50">·</span>
      <span className="font-mono">{fmt(analysis.horasSemana)}h/sem</span>
      {extra && (
        <>
          <span className="opacity-50">·</span>
          <span className={cn("font-mono font-semibold", nivel === "ok" ? "text-status-warn-fg" : undefined)}>
            +{fmt(analysis.horasExtraSemana)}h extra
          </span>
        </>
      )}
    </span>
  );
}
