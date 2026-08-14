"use client";

import { ResultScreen, ResultMetaChip, XlButton } from "@/components/opai/terreno";

interface CheckpointDetail {
  name: string;
  status: "COMPLETED" | "GEO_NO_VERIFICADA" | "MISSED";
  timestamp?: string;
  distanceM?: number;
  geoValidada?: boolean;
  qrScanned?: boolean;
  hasPhoto?: boolean;
  geoAccuracyM?: number;
  geoConfidence?: string | null;
}

interface TrustBreakdownEntry {
  score: number;
  weight: number;
}

interface Props {
  trustScore: number;
  trustApplicable?: boolean;
  trustBreakdown?: Record<string, TrustBreakdownEntry> | null;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
  notes?: string | null;
  checkpoints?: CheckpointDetail[];
  scheduledAt?: string;
  startedAt?: string;
  status?: "cerrada_auto" | "cerrada_admin" | string;
  onBackToRondas: () => void;
}

function formatDurationStamp(minutes: number | null): string {
  if (minutes == null) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:00`;
}

export function RondaCompletada({
  trustScore,
  trustApplicable = true,
  porcentajeCompletado,
  durationMinutes,
  missed,
  notes,
  checkpoints,
  status,
  onBackToRondas,
}: Props) {
  const gpsVerified = checkpoints?.some((c) => c.geoValidada) ?? false;
  const photos = checkpoints?.filter((c) => c.hasPhoto).length ?? 0;
  const novedades = notes?.trim() ? 1 : 0;
  const closedEarly = status === "cerrada_auto" || status === "cerrada_admin";

  return (
    <ResultScreen
      tone={closedEarly ? "warn" : "ok"}
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      }
      title={closedEarly ? "RONDA CERRADA" : "RONDA COMPLETADA"}
      who={
        trustApplicable
          ? `Trust ${Math.round(trustScore)} · ${Math.round(porcentajeCompletado)}%`
          : "Ronda libre"
      }
      stamp={formatDurationStamp(durationMinutes)}
      meta={
        <>
          {gpsVerified && <ResultMetaChip tone="ok">GPS verificado</ResultMetaChip>}
          {photos > 0 && <ResultMetaChip>{photos} foto{photos === 1 ? "" : "s"}</ResultMetaChip>}
          {novedades > 0 && <ResultMetaChip tone="warn">Novedades</ResultMetaChip>}
          {missed > 0 && <ResultMetaChip tone="warn">{missed} omitidos</ResultMetaChip>}
        </>
      }
      footer={
        <XlButton variant={closedEarly ? "dark" : "ok"} size="md" onClick={onBackToRondas}>
          Volver a Mis Rondas
        </XlButton>
      }
    />
  );
}
