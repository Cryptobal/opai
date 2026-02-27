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
    <div className="space-y-4">
      {current ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-300">
                {current.puesto.name}
                <span className="ml-2 text-xs text-emerald-300/60">Slot {current.slotNumber}</span>
              </p>
              <p className="text-xs text-emerald-200/80 mt-1">
                {current.installation.name}
                {current.installation.account && ` · ${current.installation.account.name}`}
              </p>
              <p className="text-xs text-emerald-200/60 mt-0.5">
                {current.puesto.shiftStart} - {current.puesto.shiftEnd} · Desde {formatDateUTC(current.startDate)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
              Activo
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-amber-400 py-1">Sin asignación activa — guardia no asignado a ningún puesto.</p>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial de asignaciones</p>
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="rounded-md border border-border/60 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{h.puesto.name}</span>
                    <span className="text-muted-foreground"> · {h.installation.name}</span>
                    {h.installation.account && (
                      <span className="text-muted-foreground"> · {h.installation.account.name}</span>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mt-0.5">
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
