"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekClosePanelRow, type WeekStatusDTO } from "./WeekClosePanelRow";

interface Props {
  onCloseWeek: (weekEndIso: string) => void;
  /** Reabre (desbloquea) una semana cerrada desde su candado de fila. */
  onReopenWeek?: (
    weekEndIso: string,
    opts: { isAnchor: boolean; label: string },
  ) => void;
  /** Solo con permiso de gestión se muestran las acciones (cerrar / candado). */
  canManage?: boolean;
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
  onReopenWeek,
  canManage = true,
  reloadKey = 0,
  currentBankBalanceClp,
}: Props) {
  const [weeks, setWeeks] = useState<WeekStatusDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Colapsado por defecto: el cierre/reapertura vive en las columnas de la
  // grilla. Este panel es solo el aviso de huecos, expandible para verlos todos.
  const [expanded, setExpanded] = useState(false);

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

  // Sin huecos: no hay nada urgente que avisar. El cierre/reapertura de las
  // semanas visibles se hace en las columnas de la grilla, así que no mostramos
  // un panel apilado que solo agrega ruido.
  if (openCount === 0) return null;

  return (
    <section className="rounded-ds-lg border border-status-warn-border bg-status-warn-soft">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn-fg" />
        <p className="min-w-0 flex-1 text-[12px] text-ds-text-2">
          <b className="text-status-warn-fg">
            {openCount} {openCount === 1 ? "semana sin cerrar" : "semanas sin cerrar"}.
          </b>{" "}
          Ciérralas en su columna de la planilla (usa ‹ para retroceder).
        </p>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-status-warn-fg">
          {expanded ? "Ocultar" : "Ver semanas"}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded && (
        <ol className="space-y-1.5 border-t border-status-warn-border/60 px-3 py-2.5">
          {ordered.map((w) => (
            <WeekClosePanelRow
              key={w.weekEndDate}
              w={w}
              onCloseWeek={onCloseWeek}
              onReopenWeek={onReopenWeek}
              canManage={canManage}
              currentBankBalanceClp={currentBankBalanceClp}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
