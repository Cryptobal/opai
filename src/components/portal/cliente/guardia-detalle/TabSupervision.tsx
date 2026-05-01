"use client";

import { Eye } from "lucide-react";
import type { Supervision } from "./types";

interface Props {
  supervision: Supervision[];
}

export function TabSupervision({ supervision }: Props) {
  if (supervision.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
        <Eye className="h-8 w-8" />
        <p className="text-sm text-center px-6">
          Sin evaluaciones de supervisión publicadas para este guardia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {supervision.map((s) => (
        <div
          key={s.visitId}
          className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">{s.supervisorName}</p>
              {s.visitDate && (
                <p className="text-[11px] text-zinc-500">
                  {new Date(s.visitDate).toLocaleString("es-CL", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
            {s.isReinforcement && (
              <span className="text-[10px] text-status-warn-fg bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
                Refuerzo
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ScoreCell label="Presentación" value={s.presentationScore} />
            <ScoreCell label="Orden" value={s.orderScore} />
            <ScoreCell label="Protocolo" value={s.protocolScore} />
          </div>
          {s.observation && (
            <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
              {s.observation}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded bg-white/[0.03] py-2">
      <div className="text-lg font-mono font-semibold text-status-info-fg">
        {value ?? "—"}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}
