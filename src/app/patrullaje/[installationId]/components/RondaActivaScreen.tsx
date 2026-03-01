"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckpointCard, type CheckpointStatus } from "./CheckpointCard";
import { OfflineBadge } from "./OfflineBadge";
import type { GeoPosition } from "@/lib/patrullaje/use-geolocation";
import { haversineDistance } from "@/lib/patrullaje/use-geolocation";

interface CheckpointData {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  verificationType: string;
  qrCode: string;
  isCritical: boolean;
  order: number;
  isRequired: boolean;
}

interface MarkedCheckpoint {
  checkpointId: string;
  markedAt: string;
  hasPhoto?: boolean;
  hasAudio?: boolean;
}

interface Props {
  templateName: string;
  checkpoints: CheckpointData[];
  markedCheckpoints: MarkedCheckpoint[];
  position: GeoPosition | null;
  isOffline: boolean;
  onMarkGeo: (checkpointId: string) => Promise<void>;
  onMarkQr: (checkpointId: string, qrCode: string) => Promise<void>;
  onOpenQrScanner: () => void;
  onOpenPhoto: (checkpointId: string) => void;
  onOpenAudio: (checkpointId: string) => void;
  onOpenNote: (checkpointId: string) => void;
  onComplete: () => void;
  onPanic: () => void;
  startedAt: Date;
}

export function RondaActivaScreen({
  templateName,
  checkpoints,
  markedCheckpoints,
  position,
  isOffline,
  onMarkGeo,
  onMarkQr,
  onOpenQrScanner,
  onOpenPhoto,
  onOpenAudio,
  onOpenNote,
  onComplete,
  onPanic,
  startedAt,
}: Props) {
  const [elapsed, setElapsed] = useState("00:00:00");
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const markedSet = useMemo(
    () => new Set(markedCheckpoints.map((m) => m.checkpointId)),
    [markedCheckpoints],
  );

  const sorted = useMemo(
    () => [...checkpoints].sort((a, b) => a.order - b.order),
    [checkpoints],
  );

  const activeIndex = sorted.findIndex((cp) => !markedSet.has(cp.id));
  const allDone = activeIndex === -1;
  const completedCount = markedCheckpoints.length;

  const handleMarkGeo = async (cpId: string) => {
    setMarkingId(cpId);
    try {
      await onMarkGeo(cpId);
      if (navigator.vibrate) navigator.vibrate(150);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] pb-[calc(env(safe-area-inset-bottom)+80px)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 animate-pulse">
              EN RONDA
            </span>
            {isOffline && <OfflineBadge />}
          </div>
          <span className="font-mono text-sm text-white/70">{elapsed}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/40">{templateName}</span>
          <span className="text-xs font-medium text-white/60">
            {completedCount}/{sorted.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full rounded-full bg-white/10 mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${sorted.length > 0 ? (completedCount / sorted.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Checkpoint list */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {sorted.map((cp, i) => {
          let status: CheckpointStatus = "pending";
          if (markedSet.has(cp.id)) status = "completed";
          else if (i === activeIndex) status = "active";

          const mark = markedCheckpoints.find((m) => m.checkpointId === cp.id);
          const dist =
            status === "active" && position && cp.lat != null && cp.lng != null
              ? haversineDistance(position.lat, position.lng, cp.lat, cp.lng)
              : null;

          return (
            <CheckpointCard
              key={cp.id}
              index={i + 1}
              name={cp.name}
              verificationType={cp.verificationType}
              isCritical={cp.isCritical}
              status={status}
              markedAt={mark?.markedAt}
              hasPhoto={mark?.hasPhoto}
              hasAudio={mark?.hasAudio}
              distanceM={dist}
              radiusM={cp.radius}
              onMark={() => handleMarkGeo(cp.id)}
              onScanQr={onOpenQrScanner}
              onPhoto={() => onOpenPhoto(cp.id)}
              onAudio={() => onOpenAudio(cp.id)}
              onNote={() => onOpenNote(cp.id)}
              markEnabled={markingId === null}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0f]/95 backdrop-blur-sm border-t border-white/5 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] space-y-2">
        {allDone ? (
          <button
            onClick={onComplete}
            className="h-14 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-semibold text-white active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20"
          >
            ✓ Finalizar ronda
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onComplete}
              className="flex-1 h-12 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50 active:bg-white/10"
            >
              Finalizar parcial
            </button>
            <button
              onClick={onPanic}
              className="h-12 px-4 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-400 font-medium active:bg-red-500/25"
            >
              🚨 Pánico
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
