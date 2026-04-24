"use client";

import { AlertTriangle, MapPin } from "lucide-react";

export type InstallationRow = {
  installationId: string;
  installationName: string;
  clientName: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  commune: string | null;
  totalActive: number;
  byPriority: { p1: number; p2: number; p3: number; p4: number };
  slaBreached: number;
  lastActivityAt: string;
  criticalityScore: number;
};

function severityStyle(row: InstallationRow): {
  border: string;
  bg: string;
} {
  if (row.slaBreached > 0 || row.byPriority.p1 > 0) {
    return { border: "border-red-500/40", bg: "bg-red-500/5" };
  }
  if (row.byPriority.p2 > 0) {
    return { border: "border-amber-500/40", bg: "bg-amber-500/5" };
  }
  return { border: "border-white/10", bg: "" };
}

function priorityBarWidths(row: InstallationRow): {
  p1: string;
  p2: string;
  p3: string;
  p4: string;
} {
  const t = row.totalActive || 1;
  return {
    p1: `${(row.byPriority.p1 / t) * 100}%`,
    p2: `${(row.byPriority.p2 / t) * 100}%`,
    p3: `${(row.byPriority.p3 / t) * 100}%`,
    p4: `${(row.byPriority.p4 / t) * 100}%`,
  };
}

interface Props {
  row: InstallationRow;
  onClick: (installationId: string) => void;
}

export function InstallationTicketCard({ row, onClick }: Props) {
  const style = severityStyle(row);
  const widths = priorityBarWidths(row);
  const hasLocation = row.lat != null && row.lng != null;

  return (
    <button
      type="button"
      onClick={() => onClick(row.installationId)}
      className={`relative flex flex-col gap-3 rounded-lg border ${style.border} ${style.bg} p-4 text-left transition-colors hover:border-opacity-70 focus:outline-none focus:ring-2 focus:ring-ring`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {row.installationName}
          </h3>
          {row.clientName && (
            <p className="truncate text-xs text-muted-foreground">
              {row.clientName}
            </p>
          )}
        </div>
        {row.slaBreached > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
            <AlertTriangle className="h-3 w-3" />
            {row.slaBreached} venc
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-foreground">
          {row.totalActive}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.totalActive === 1 ? "ticket activo" : "tickets activos"}
        </span>
      </div>

      {row.totalActive > 0 && (
        <>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-red-500" style={{ width: widths.p1 }} />
            <div className="bg-orange-500" style={{ width: widths.p2 }} />
            <div className="bg-yellow-500" style={{ width: widths.p3 }} />
            <div className="bg-muted-foreground/40" style={{ width: widths.p4 }} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              P1: <span className="font-semibold text-red-400">{row.byPriority.p1}</span>
            </span>
            <span>
              P2: <span className="font-semibold text-orange-400">{row.byPriority.p2}</span>
            </span>
            <span>
              P3: <span className="font-semibold text-yellow-400">{row.byPriority.p3}</span>
            </span>
            <span>
              P4: <span className="font-semibold">{row.byPriority.p4}</span>
            </span>
          </div>
        </>
      )}

      {!hasLocation && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <MapPin className="h-3 w-3" />
          sin ubicación geográfica
        </span>
      )}
    </button>
  );
}
