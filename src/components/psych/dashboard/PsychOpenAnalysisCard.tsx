"use client";

import type { OpenAnalysisResult } from "@/lib/psych/types";

export default function PsychOpenAnalysisCard({
  entry,
}: {
  entry: OpenAnalysisResult;
}) {
  if (entry.error) {
    return (
      <div className="rounded-xl border border-status-warn-border bg-status-warn-soft p-4 text-sm">
        <p className="font-medium text-foreground/90">
          Análisis cualitativo pendiente
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          La IA no pudo procesar esta respuesta. Detalle técnico: {entry.error}
        </p>
      </div>
    );
  }
  if (!entry.summary) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        La IA no detectó marcadores relevantes en esta respuesta.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>
      {entry.markers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.markers.map((m) => (
            <span key={m} className="text-xs px-2 py-1 rounded-md bg-muted text-foreground/90">
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {entry.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.flags.map((f) => (
            <span key={f} className="text-xs px-2 py-1 rounded-md bg-status-danger-soft text-status-danger-fg dark:text-status-danger-fg border border-status-danger-border font-medium">
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
