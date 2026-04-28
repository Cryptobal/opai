"use client";

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

type AsignacionHistorial = {
  id: string;
  puestoId: string;
  slotNumber: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  reason?: string | null;
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string; cargo?: { name: string } | null };
  installation: {
    id: string;
    name: string;
    account?: { id: string; name: string } | null;
  };
};

interface AsignacionSectionProps {
  asignaciones: AsignacionHistorial[];
}

export default function AsignacionSection({ asignaciones }: AsignacionSectionProps) {
  const current = asignaciones.find((a) => a.isActive);
  const history = asignaciones.filter((a) => !a.isActive);

  return (
    <div className="space-y-5">
      {current ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-300">
                {current.puesto.name}
                <span className="ml-2 text-xs font-normal text-emerald-300/60">Slot {current.slotNumber}</span>
              </p>
              <p className="text-xs text-emerald-200/80 mt-1">
                {current.installation.name}
                {current.installation.account && ` · ${current.installation.account.name}`}
              </p>
              <p className="text-xs text-emerald-200/60 mt-1">
                {current.puesto.shiftStart} – {current.puesto.shiftEnd} · Desde {formatDateUTC(current.startDate)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300 border border-emerald-500/30">
              Activo
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-amber-300">
          Sin asignación activa — guardia no asignado a ningún puesto.
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Historial de asignaciones</p>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 text-xs transition-colors hover:bg-card/60 hover:border-border">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{h.puesto.name}</span>
                    <span className="text-muted-foreground"> · {h.installation.name}</span>
                    {h.installation.account && (
                      <span className="text-muted-foreground"> · {h.installation.account.name}</span>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mt-1 tabular-nums">
                  {formatDateUTC(h.startDate)}
                  {h.endDate && ` → ${formatDateUTC(h.endDate)}`}
                  {h.reason && ` · ${h.reason}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
