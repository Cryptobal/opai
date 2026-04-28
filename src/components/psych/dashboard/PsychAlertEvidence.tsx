"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PsychAlertEvidence as Evidence } from "@/lib/psych/types";

const LIKERT_LABELS: Record<number, string> = {
  1: "Muy en desacuerdo",
  2: "En desacuerdo",
  3: "Neutro",
  4: "De acuerdo",
  5: "Muy de acuerdo",
};

export default function PsychAlertEvidence({ evidence }: { evidence?: Evidence }) {
  const [open, setOpen] = useState(false);
  if (!evidence) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-foreground/70 hover:text-foreground flex items-center gap-1"
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Ocultar evidencia" : "Ver evidencia"}
      </button>
      {open ? (
        <div className="mt-2 rounded-md bg-muted/30 p-3 text-xs text-foreground/90 space-y-2">
          {renderEvidence(evidence)}
        </div>
      ) : null}
    </div>
  );
}

function renderEvidence(e: Evidence) {
  switch (e.kind) {
    case "low_dimension":
      return (
        <div>
          <p className="font-medium mb-1">
            Puntaje {Math.round(e.observed * 100)} / 100 (umbral {Math.round(e.threshold * 100)}).
            Items que más bajaron la dimensión:
          </p>
          <ul className="space-y-1.5">
            {e.worstItems.map((it) => (
              <li key={it.itemId} className="border-l-2 border-amber-500/30 pl-2">
                <p className="text-foreground/70">#{it.order} — {it.prompt}</p>
                <p>Respuesta: {formatResponse(it.response)} → {Math.round(it.normalizedScore * 100)}/100</p>
              </li>
            ))}
          </ul>
        </div>
      );
    case "high_lie":
      return (
        <div>
          <p className="font-medium mb-1">
            {e.hits.length} de los items LIE marcados con valor extremo (4 o 5).
            Umbral: {Math.round(e.threshold * 100)}%, observado: {Math.round(e.observed * 100)}%.
          </p>
          <ul className="space-y-1.5">
            {e.hits.map((h) => (
              <li key={h.itemId} className="border-l-2 border-amber-500/30 pl-2">
                <p className="text-foreground/70">#{h.order} — {h.prompt}</p>
                <p>Respuesta: <strong>{LIKERT_LABELS[h.value] ?? h.value}</strong></p>
              </li>
            ))}
          </ul>
        </div>
      );
    case "straight_lining":
      return (
        <div>
          <p className="font-medium mb-1">
            Desviación estándar {e.observedStd.toFixed(2)} (umbral &lt; {e.threshold}).
            Media: {e.mean.toFixed(2)}.
          </p>
          <p className="text-foreground/70">
            Secuencia Likert: {e.sequence.map((s) => s.value).join(", ")}
          </p>
        </div>
      );
    case "fast_latency":
      return (
        <div>
          <p className="font-medium mb-1">
            {Math.round(e.observedRatio * 100)}% de respuestas bajo el mínimo esperado
            (umbral {Math.round(e.threshold * 100)}%).
          </p>
          <ul className="space-y-1.5">
            {e.fastItems.slice(0, 5).map((it) => (
              <li key={it.itemId}>
                #{it.order}: {it.latencyMs}ms (mínimo {it.minLatencyMs}ms)
              </li>
            ))}
          </ul>
        </div>
      );
    case "ai_red_flag":
      return (
        <div>
          <p className="font-medium mb-1">
            Pregunta abierta #{e.order}: {e.prompt}
          </p>
          <div className="border-l-2 border-red-500/40 pl-2 my-1">
            <p className="text-foreground/70 text-[11px]">Respuesta del candidato:</p>
            <p>&quot;{e.response}&quot;</p>
          </div>
          {e.summary ? <p className="text-foreground/70 italic">IA: {e.summary}</p> : null}
          {e.markers.length > 0 ? (
            <p className="text-foreground/70">Marcadores: {e.markers.join(", ")}</p>
          ) : null}
        </div>
      );
    case "ai_failure":
      return (
        <div>
          <p className="font-medium mb-1">
            Error en análisis IA del item #{e.order}.
          </p>
          <p className="text-foreground/70">{e.errorMessage}</p>
          <p className="text-[11px] text-foreground/60 mt-1">
            Esto no es una alerta sobre el candidato. Reintentar con &quot;Recalcular&quot;.
          </p>
        </div>
      );
  }
}

function formatResponse(r: unknown): string {
  if (r == null) return "—";
  if (typeof r === "string") return r;
  if (typeof r === "number") return String(r);
  if (typeof r === "object" && "value" in r) {
    const v = (r as { value: unknown }).value;
    if (typeof v === "number" && LIKERT_LABELS[v]) return LIKERT_LABELS[v];
    return String(v);
  }
  return JSON.stringify(r);
}
