"use client";

import { useState } from "react";
import { LogOut, Loader2, MapPin, QrCode, AlertTriangle, Clock, Navigation } from "lucide-react";

interface Checkpoint {
  id: string;
  name: string;
  verificationType: string;
  isCritical: boolean;
  radius: number;
  lat: number | null;
  lng: number | null;
  order: number;
  qrCode: string;
  isRequired: boolean;
}

interface Ronda {
  id: string;
  rondaTemplate: {
    name: string;
    estimatedDurationMin: number | null;
    checkpoints: Array<{
      checkpoint: Checkpoint;
      orderIndex: number;
      isRequired: boolean;
    }>;
  };
  scheduledAt: string;
  status: string;
}

interface Props {
  guardiaNombre: string;
  rondas: Ronda[];
  installationName: string;
  gpsReady: boolean;
  onStart: (execId: string) => Promise<void>;
  onLogout: () => void;
}

export function PreRondaScreen({ guardiaNombre, rondas, installationName, gpsReady, onStart, onLogout }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleStart = async (execId: string) => {
    setLoading(execId);
    try {
      await onStart(execId);
    } finally {
      setLoading(null);
    }
  };

  const pendingRondas = rondas.filter(r => r.status === "pendiente" || r.status === "en_curso" || r.status === "incompleta");

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Hola, {guardiaNombre.split(" ")[0]}</h2>
          <p className="text-[11px] text-white/40">{installationName}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 active:bg-red-500/20"
        >
          <LogOut className="h-3.5 w-3.5" /> Salir
        </button>
      </div>

      <div className="flex-1 space-y-3">
        {pendingRondas.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center space-y-2">
            <Clock className="h-8 w-8 text-white/20 mx-auto" />
            <p className="text-sm text-white/50">No hay rondas programadas</p>
            <p className="text-[11px] text-white/30">Contacte a su supervisor si cree que esto es un error.</p>
          </div>
        )}

        {pendingRondas.map((ronda) => {
          const cps = ronda.rondaTemplate.checkpoints || [];
          return (
            <div key={ronda.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{ronda.rondaTemplate.name}</h3>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {cps.length} checkpoints
                  {ronda.rondaTemplate.estimatedDurationMin && ` · ~${ronda.rondaTemplate.estimatedDurationMin} min`}
                </p>
              </div>

              <div className="space-y-1.5">
                {cps.sort((a, b) => a.orderIndex - b.orderIndex).map((tc, i) => (
                  <div key={tc.checkpoint.id} className="flex items-center gap-2.5 py-1">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/50">
                      {i + 1}
                    </div>
                    <span className="text-xs text-white/70 flex-1">{tc.checkpoint.name}</span>
                    <div className="flex items-center gap-1">
                      {(tc.checkpoint.verificationType === "GEOFENCE" || tc.checkpoint.verificationType === "BOTH") && (
                        <span className="rounded-full bg-emerald-500/15 p-0.5"><MapPin className="h-2.5 w-2.5 text-emerald-400" /></span>
                      )}
                      {(tc.checkpoint.verificationType === "QR" || tc.checkpoint.verificationType === "BOTH") && (
                        <span className="rounded-full bg-blue-500/15 p-0.5"><QrCode className="h-2.5 w-2.5 text-blue-400" /></span>
                      )}
                      {tc.checkpoint.isCritical && (
                        <span className="rounded-full bg-red-500/15 p-0.5"><AlertTriangle className="h-2.5 w-2.5 text-red-400" /></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleStart(ronda.id)}
                disabled={loading === ronda.id}
                className="h-12 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {loading === ronda.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "▶ Iniciar ronda"
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-white/30">
        <span className={gpsReady ? "text-emerald-400/60" : "text-red-400/60"}>
          <Navigation className="inline h-3 w-3 mr-0.5" />
          GPS: {gpsReady ? "✓" : "✗"}
        </span>
        <span>·</span>
        <span className="text-emerald-400/60">Geocercas: ✓</span>
        <span>·</span>
        <span className="text-emerald-400/60">Offline: ✓</span>
      </div>
    </div>
  );
}
