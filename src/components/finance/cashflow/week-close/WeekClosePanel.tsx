"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { WeekClosePanelRow, type WeekStatusDTO } from "./WeekClosePanelRow";

interface Props {
  onCloseWeek: (weekEndIso: string) => void;
  /** Cambiar este valor fuerza un refetch (tras cerrar / mover). */
  reloadKey?: number;
  /** Saldo banco vigente, para la fila de la semana en curso (aún sin cierre). */
  currentBankBalanceClp?: number;
}

/**
 * Panel "Semanas por cerrar": la secuencia completa de semanas con su estado de
 * cierre, resaltando los HUECOS (semanas pasadas sin cierre). Abre el
 * WeekCloseDrawer existente para cerrar cualquiera de ellas.
 */
export function WeekClosePanel({
  onCloseWeek,
  reloadKey = 0,
  currentBankBalanceClp,
}: Props) {
  const [weeks, setWeeks] = useState<WeekStatusDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/cashflow/weekly-close/status");
      const j = await res.json();
      if (j.success) setWeeks(j.data as WeekStatusDTO[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!weeks) {
    return loading ? (
      <div className="flex items-center gap-2 text-xs text-ds-text-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando semanas…
      </div>
    ) : null;
  }
  if (weeks.length === 0) return null;

  const openCount = weeks.filter((w) => w.state === "OPEN").length;
  const ordered = [...weeks].reverse(); // más reciente arriba

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-ds-text-1">Semanas por cerrar</h2>
      {openCount > 0 && (
        <div className="flex items-start gap-2 rounded-ds-lg border border-status-warn-border bg-status-warn-soft px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn-fg" />
          <p className="text-[12px] text-ds-text-2">
            <b className="text-status-warn-fg">
              Tienes {openCount} {openCount === 1 ? "semana" : "semanas"} sin cerrar.
            </b>{" "}
            Ciérralas de la más antigua a la más reciente para que la proyección arranque
            de un saldo confiable.
          </p>
        </div>
      )}
      <ol className="space-y-1.5">
        {ordered.map((w) => (
          <WeekClosePanelRow
            key={w.weekEndDate}
            w={w}
            onCloseWeek={onCloseWeek}
            currentBankBalanceClp={currentBankBalanceClp}
          />
        ))}
      </ol>
    </section>
  );
}
