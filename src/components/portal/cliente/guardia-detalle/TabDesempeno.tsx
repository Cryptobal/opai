"use client";

import { TrendingUp, CheckCircle2, AlertTriangle, Calendar } from "lucide-react";
import type { Desempeno } from "./types";

interface Props {
  desempeno: Desempeno;
}

export function TabDesempeno({ desempeno }: Props) {
  return (
    <div className="space-y-3">
      {desempeno.trustScore != null && (
        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-teal-300/80">
                Trust Score
              </p>
              <p className="text-3xl font-mono font-semibold text-teal-300 mt-1">
                {Math.round(desempeno.trustScore)}
              </p>
            </div>
            {desempeno.nivel && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Nivel
                </p>
                <p className="text-sm text-teal-300 mt-1">{desempeno.nivel}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={Calendar}
          label="Asistencia"
          value={`${desempeno.asistenciaUltimos30Dias}%`}
          sub="últ 30 días"
          tone="text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
        />
        <StatCard
          icon={CheckCircle2}
          label="Rondas"
          value={desempeno.rondasCompletadasUltimos30Dias}
          sub="últ 30 días"
          tone="text-teal-400 bg-teal-400/10 border-teal-400/20"
        />
        <StatCard
          icon={AlertTriangle}
          label="Incidentes"
          value={desempeno.incidentesUltimos30Dias}
          sub="últ 30 días"
          tone={
            desempeno.incidentesUltimos30Dias > 0
              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
              : "text-zinc-400 bg-white/[0.03] border-white/[0.06]"
          }
        />
      </div>
      {desempeno.trustScore == null && (
        <p className="text-xs text-zinc-500 text-center py-4">
          <TrendingUp className="h-5 w-5 mx-auto mb-2 text-zinc-600" />
          Aún no hay Trust Score calculado para este guardia.
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub: string;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {label}
        </span>
        <Icon className="h-3 w-3" />
      </div>
      <div className="text-xl font-mono font-semibold mt-0.5">{value}</div>
      <div className="text-[10px] opacity-60">{sub}</div>
    </div>
  );
}
