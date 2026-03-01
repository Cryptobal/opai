"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { TrustScoreCircle } from "./TrustScoreCircle";

interface Props {
  trustScore: number;
  trustBreakdown?: Record<string, { score: number; weight: number; detail?: string }>;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  durationMinutes: number | null;
  missed: number;
  onLogout: () => void;
}

export function RondaCompletadaScreen({
  trustScore,
  trustBreakdown,
  checkpointsCompleted,
  checkpointsTotal,
  durationMinutes,
  missed,
  onLogout,
}: Props) {
  useEffect(() => {
    const timer = setTimeout(onLogout, 30000);
    return () => clearTimeout(timer);
  }, [onLogout]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0f] px-6 py-8">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500 animate-in zoom-in-50 duration-500">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Ronda completada</h2>
          <p className="text-sm text-white/50">
            {checkpointsCompleted}/{checkpointsTotal} checkpoints
            {durationMinutes != null && ` · ${durationMinutes} min`}
            {missed > 0 && (
              <span className="text-amber-400"> · {missed} sin marcar</span>
            )}
          </p>
        </div>

        <TrustScoreCircle score={trustScore} breakdown={trustBreakdown} />

        <button
          onClick={onLogout}
          className="h-12 w-full rounded-xl border border-white/10 bg-white/5 text-sm text-white/60 active:bg-white/10 transition-colors"
        >
          Cerrar sesión
        </button>

        <p className="text-[10px] text-white/20">Auto-cierre en 30 segundos</p>
      </div>
    </div>
  );
}
