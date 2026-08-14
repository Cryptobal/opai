"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GpsChipStatus = "ok" | "warn" | "off";

export interface TruthBarProps {
  gpsStatus: GpsChipStatus;
  gpsAccuracyM?: number | null;
  online: boolean;
  queueCount?: number;
  extra?: ReactNode;
  className?: string;
}

function gpsLabel(status: GpsChipStatus, meters?: number | null): string {
  if (status === "off") return "Sin GPS";
  if (status === "warn" && (meters == null || meters <= 0)) return "Buscando GPS";
  const m = meters != null && Number.isFinite(meters) ? Math.round(meters) : null;
  return m != null ? `GPS · ${m}m` : "GPS";
}

export function TruthBar({
  gpsStatus,
  gpsAccuracyM,
  online,
  queueCount = 0,
  extra,
  className,
}: TruthBarProps) {
  const gpsChip =
    gpsStatus === "ok"
      ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
      : gpsStatus === "warn"
        ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
        : "bg-ds-surface-2 text-ds-text-3 border-ds-border-default";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-40 flex flex-wrap items-center gap-1.5 border-b border-ds-border-subtle bg-ds-surface-1/95 px-3 py-1.5 backdrop-blur-sm",
        className,
      )}
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <span
        className={cn(
          "inline-flex min-h-8 items-center rounded-full border px-2.5 text-[12px] font-medium font-mono tabular-nums",
          gpsChip,
        )}
      >
        {gpsLabel(gpsStatus, gpsAccuracyM)}
      </span>

      <span
        className={cn(
          "inline-flex min-h-8 items-center rounded-full border px-2.5 text-[12px] font-medium",
          online
            ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
            : "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
        )}
      >
        {online ? "En línea" : "Sin conexión"}
      </span>

      {queueCount > 0 && (
        <span className="inline-flex min-h-8 items-center rounded-full border border-status-warn-border bg-status-warn-soft px-2.5 text-[12px] font-semibold text-status-warn-fg tabular-nums">
          {queueCount} en cola
        </span>
      )}

      {extra ? (
        <span className="inline-flex min-h-8 items-center rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[12px] font-medium text-ds-text-2">
          {extra}
        </span>
      ) : null}
    </div>
  );
}
