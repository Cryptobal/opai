"use client";

import { cn } from "@/lib/utils";

interface Props {
  distanceM: number | null;
  radiusM: number;
}

export function GeofenceIndicator({ distanceM, radiusM }: Props) {
  const withinRange = distanceM != null && distanceM <= radiusM;
  const pct = distanceM != null
    ? Math.min(100, Math.max(5, (1 - distanceM / (radiusM * 3)) * 100))
    : 0;

  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            withinRange ? "bg-emerald-500" : pct > 30 ? "bg-blue-500" : "bg-white/20",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-white/40 text-center">
        {distanceM != null ? `${Math.round(distanceM)}m / ${radiusM}m` : "Sin señal GPS"}
      </p>
    </div>
  );
}
