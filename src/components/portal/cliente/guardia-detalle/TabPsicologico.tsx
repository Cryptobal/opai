"use client";

import { Brain, ShieldCheck } from "lucide-react";
import type { Psicologico } from "./types";

interface Props {
  psicologico: Psicologico | null;
}

const BAND_LABELS: Record<"ALTO" | "MEDIO" | "BAJO", { label: string; tone: string }> = {
  ALTO: {
    label: "Alto ajuste",
    tone: "text-status-ok-fg bg-status-ok-soft border-status-ok-border",
  },
  MEDIO: {
    label: "Ajuste medio",
    tone: "text-status-warn-fg bg-status-warn-soft border-status-warn-border",
  },
  BAJO: {
    label: "Ajuste bajo",
    tone: "text-status-danger-fg bg-status-danger-soft border-status-danger-border",
  },
};

export function TabPsicologico({ psicologico }: Props) {
  if (!psicologico || !psicologico.tieneEvaluacion || !psicologico.band) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
        <Brain className="h-8 w-8" />
        <p className="text-sm text-center px-6">
          Este guardia aún no cuenta con evaluación psicolaboral publicada.
        </p>
      </div>
    );
  }

  const band = BAND_LABELS[psicologico.band];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-status-info-fg" />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Resultado de evaluación
            </p>
            <span
              className={`inline-block mt-1 text-sm font-medium rounded-full px-3 py-1 border ${band.tone}`}
            >
              {band.label}
            </span>
          </div>
        </div>
        {psicologico.scoredAt && (
          <p className="text-[11px] text-zinc-500 mt-3">
            Evaluado el{" "}
            {new Date(psicologico.scoredAt).toLocaleDateString("es-CL")}
          </p>
        )}
        {psicologico.revisadoPorPsicologo && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-status-ok-fg">
            <ShieldCheck className="h-3 w-3" />
            Revisado por psicólogo certificado
          </div>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed px-1">
        Evaluación realizada conforme a protocolo interno de selección. Solo se
        comparte la banda de ajuste general; los detalles de dimensiones y
        puntajes son reservados por normativa de privacidad.
      </p>
    </div>
  );
}
