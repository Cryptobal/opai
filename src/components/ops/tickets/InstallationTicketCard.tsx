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

/**
 * Color del rail lateral (4px) según el peor estado:
 *   - hay SLA vencido    → danger
 *   - hay P1             → danger
 *   - hay P2             → warn
 *   - resto              → border default (neutro)
 *
 * El fondo se mantiene neutro (`bg-ds-surface-1`) para no saturar la vista
 * cuando hay decenas de instalaciones — el peligro lo comunica el rail + el
 * badge "X venc" + las micro-barras.
 */
function railColor(row: InstallationRow): string {
  if (row.slaBreached > 0 || row.byPriority.p1 > 0) return "border-l-status-danger";
  if (row.byPriority.p2 > 0) return "border-l-status-warn";
  return "border-l-border";
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

function slaBarWidths(row: InstallationRow): { breached: string; ok: string } {
  const t = row.totalActive || 1;
  const breachedPct = (row.slaBreached / t) * 100;
  return {
    breached: `${breachedPct}%`,
    ok: `${100 - breachedPct}%`,
  };
}

interface Props {
  row: InstallationRow;
  onClick: (installationId: string) => void;
}

export function InstallationTicketCard({ row, onClick }: Props) {
  const rail = railColor(row);
  const priorityWidths = priorityBarWidths(row);
  const sla = slaBarWidths(row);
  const hasLocation = row.lat != null && row.lng != null;
  const hasSlaSignal = row.totalActive > 0;

  return (
    <button
      type="button"
      onClick={() => onClick(row.installationId)}
      className={`group relative flex flex-col gap-3 rounded-xl border border-border border-l-[4px] bg-ds-surface-1 p-4 text-left transition-colors hover:bg-ds-surface-2 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring ${rail}`}
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
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-danger-soft px-2 py-0.5 text-[10px] font-medium text-status-danger-fg"
            title="Tickets con SLA vencido"
          >
            <AlertTriangle className="h-3 w-3" />
            {row.slaBreached} venc
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">
          {row.totalActive}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.totalActive === 1 ? "ticket activo" : "tickets activos"}
        </span>
      </div>

      {row.totalActive > 0 && (
        <>
          {/* Mix por prioridad */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Prioridad</span>
              <span className="flex gap-2 normal-case tracking-normal">
                <span>P1: <span className="font-semibold text-status-danger-fg">{row.byPriority.p1}</span></span>
                <span>P2: <span className="font-semibold text-status-warn-fg">{row.byPriority.p2}</span></span>
                <span>P3: <span className="font-semibold text-status-info-fg">{row.byPriority.p3}</span></span>
                <span>P4: <span className="font-semibold">{row.byPriority.p4}</span></span>
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-status-danger" style={{ width: priorityWidths.p1 }} />
              <div className="bg-status-warn" style={{ width: priorityWidths.p2 }} />
              <div className="bg-status-info" style={{ width: priorityWidths.p3 }} />
              <div className="bg-muted-foreground/40" style={{ width: priorityWidths.p4 }} />
            </div>
          </div>

          {/* Estado de SLA */}
          {hasSlaSignal && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>SLA</span>
                <span className="normal-case tracking-normal">
                  {row.slaBreached > 0 ? (
                    <>
                      <span className="font-semibold text-status-danger-fg">{row.slaBreached}</span>
                      <span> vencido{row.slaBreached === 1 ? "" : "s"}</span>
                      <span className="text-muted-foreground"> · {row.totalActive - row.slaBreached} en plazo</span>
                    </>
                  ) : (
                    <span className="text-status-ok-fg">Todo en plazo</span>
                  )}
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="bg-status-danger" style={{ width: sla.breached }} />
                <div className="bg-status-ok/70" style={{ width: sla.ok }} />
              </div>
            </div>
          )}
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
