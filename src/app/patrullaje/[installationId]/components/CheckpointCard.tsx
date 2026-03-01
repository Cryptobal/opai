"use client";

import { cn } from "@/lib/utils";
import { Check, MapPin, QrCode, AlertTriangle, Mic, Camera } from "lucide-react";

export type CheckpointStatus = "completed" | "active" | "pending";

interface CheckpointCardProps {
  index: number;
  name: string;
  verificationType: string;
  isCritical: boolean;
  status: CheckpointStatus;
  markedAt?: string | null;
  hasPhoto?: boolean;
  hasAudio?: boolean;
  distanceM?: number | null;
  radiusM?: number;
  onMark?: () => void;
  onScanQr?: () => void;
  onPhoto?: () => void;
  onAudio?: () => void;
  onNote?: () => void;
  markEnabled?: boolean;
}

export function CheckpointCard({
  index,
  name,
  verificationType,
  isCritical,
  status,
  markedAt,
  hasPhoto,
  hasAudio,
  distanceM,
  radiusM = 30,
  onMark,
  onScanQr,
  onPhoto,
  onAudio,
  onNote,
  markEnabled,
}: CheckpointCardProps) {
  const isGeo = verificationType === "GEOFENCE" || verificationType === "BOTH";
  const isQr = verificationType === "QR" || verificationType === "BOTH";
  const withinRange = distanceM != null && distanceM <= radiusM;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        status === "completed" && "border-emerald-500/30 bg-emerald-500/5",
        status === "active" && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20",
        status === "pending" && "border-white/10 bg-white/[0.02] opacity-50",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            status === "completed" && "bg-emerald-500 text-white",
            status === "active" && "bg-blue-500 text-white",
            status === "pending" && "bg-white/10 text-white/40",
          )}
        >
          {status === "completed" ? <Check className="h-4 w-4" /> : index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-medium", status === "pending" && "text-white/40")}>
              {name}
            </span>
            {isCritical && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" /> Crítico
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1">
            {isGeo && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                <MapPin className="h-2.5 w-2.5" /> Geocerca
              </span>
            )}
            {isQr && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">
                <QrCode className="h-2.5 w-2.5" /> QR
              </span>
            )}
          </div>

          {status === "completed" && markedAt && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-emerald-400/70">
                ✓ Marcado a las {new Date(markedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {hasPhoto && <Camera className="h-3 w-3 text-white/40" />}
              {hasAudio && <Mic className="h-3 w-3 text-white/40" />}
            </div>
          )}

          {status === "active" && (
            <div className="mt-3 space-y-2">
              {isGeo && (
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-blue-300/70">
                      {distanceM != null
                        ? withinRange
                          ? "✓ En rango"
                          : `📡 ${Math.round(distanceM)}m de distancia`
                        : "📡 Calculando ubicación..."}
                    </span>
                    <span className="text-white/30">≤{radiusM}m</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        withinRange ? "bg-emerald-500" : "bg-blue-500",
                      )}
                      style={{
                        width: distanceM != null
                          ? `${Math.min(100, Math.max(5, (1 - distanceM / (radiusM * 3)) * 100))}%`
                          : "5%",
                      }}
                    />
                  </div>
                  <button
                    onClick={onMark}
                    disabled={!markEnabled || !withinRange}
                    className={cn(
                      "mt-2 h-12 w-full rounded-lg text-sm font-semibold transition-all",
                      withinRange
                        ? "bg-emerald-500 text-white active:scale-[0.98]"
                        : "bg-white/5 text-white/30 cursor-not-allowed",
                    )}
                  >
                    {withinRange ? "✓ Marcar checkpoint" : `Acércate al punto (${Math.round(distanceM ?? 0)}m)`}
                  </button>
                </div>
              )}

              {isQr && (
                <button
                  onClick={onScanQr}
                  className="h-12 w-full rounded-lg bg-blue-500/20 border border-blue-500/30 text-sm font-medium text-blue-400 active:scale-[0.98] transition-all"
                >
                  📸 Escanear QR
                </button>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onPhoto}
                  className="flex-1 h-10 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 active:bg-white/10 transition-colors"
                >
                  📷 Foto
                </button>
                <button
                  onClick={onAudio}
                  className="flex-1 h-10 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 active:bg-white/10 transition-colors"
                >
                  🎙 Audio
                </button>
                <button
                  onClick={onNote}
                  className="flex-1 h-10 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 active:bg-white/10 transition-colors"
                >
                  📝 Nota
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
