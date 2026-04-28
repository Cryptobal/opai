"use client";

import type { OpenAnalysisResult } from "@/lib/psych/types";

export default function PsychOpenAnalysisCard({
  entry,
}: {
  entry: OpenAnalysisResult;
}) {
  if (entry.error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
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
            <span key={f} className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 font-medium">
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
