"use client";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Loader2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

interface CellOccurrenceTarget {
  /** UUID si la cuota ya está materializada en FinanceCashflowOccurrence. null si es virtual. */
  id: string | null;
  /** Item dueño — siempre presente, necesario para materializar al primer move/amount. */
  itemId: string;
  /** Fecha original de la cuota (yyyy-MM-dd) que junto con itemId identifica la celda virtual. */
  originalDate: string;
  amountClp: number;
}

interface Props {
  /** Children es el contenido visual de la celda (el monto formateado, etc). */
  children: React.ReactNode;
  /** La ocurrencia materializable que se va a actuar (null = nada que hacer; renderiza children sin popover). */
  target: CellOccurrenceTarget | null;
  /** Granularidad para calcular el desplazamiento en días. */
  granularity: "weekly" | "monthly";
  /** Llamado tras una acción exitosa para que el padre haga refresh. */
  onActionDone: () => void;
}

/**
 * Popover sobre una celda de la matriz de proyección. Acciones:
 *  - Mover la ocurrencia ±1 o ±2 buckets (semanas o meses).
 *  - Editar el monto manualmente (override).
 *
 * Si target es null, simplemente renderiza children sin envoltura — útil
 * para celdas con totales o sin ocurrencia editable (auto-generadas).
 */
export function CellActionPopover({
  children,
  target,
  granularity,
  onActionDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "shift" | "amount" | "date">(null);
  const [editing, setEditing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!target) {
    return <>{children}</>;
  }

  async function callMoveEndpoint(args: { newDate?: string; daysFromCurrent?: number }) {
    if (!target) return null;
    const useUpsert = target.id === null;
    const url = useUpsert
      ? `/api/finance/cashflow/occurrences/upsert-and-act`
      : `/api/finance/cashflow/occurrences/${target.id}/move`;
    const body = useUpsert
      ? { action: "move", itemId: target.itemId, originalDate: target.originalDate, ...args }
      : args;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function shiftDays(days: number) {
    if (!target) return;
    setBusy("shift");
    setError(null);
    try {
      const j = await callMoveEndpoint({ daysFromCurrent: days });
      if (j?.success) {
        setOpen(false);
        onActionDone();
      } else {
        setError(j?.error ?? "No se pudo mover");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function moveToDate(date: Date) {
    if (!target) return;
    setBusy("date");
    setError(null);
    try {
      const j = await callMoveEndpoint({ newDate: format(date, "yyyy-MM-dd") });
      if (j?.success) {
        setOpen(false);
        setPickingDate(false);
        onActionDone();
      } else {
        setError(j?.error ?? "No se pudo mover");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function saveAmount() {
    if (!target) return;
    const cleaned = draftAmount.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Monto inválido");
      return;
    }
    setBusy("amount");
    setError(null);
    try {
      const useUpsert = target.id === null;
      const url = useUpsert
        ? `/api/finance/cashflow/occurrences/upsert-and-act`
        : `/api/finance/cashflow/occurrences/${target.id}/amount`;
      const body = useUpsert
        ? {
            action: "amount",
            itemId: target.itemId,
            originalDate: target.originalDate,
            amountClp: n,
          }
        : { amountClp: n };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) {
        setOpen(false);
        setEditing(false);
        setDraftAmount("");
        onActionDone();
      } else {
        setError(j?.error ?? "No se pudo guardar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  // granularity se mantiene por compatibilidad con la API; los nuevos
  // botones de shift son explícitos en días y semanas, no dependen del
  // contexto del bucket.
  void granularity;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setEditing(false);
          setPickingDate(false);
          setError(null);
          setDraftAmount("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full text-right hover:bg-muted/30 rounded-ds-sm px-1 py-0.5 cursor-pointer"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2">
        {pickingDate ? (
          <div className="space-y-2">
            <p className="text-[12px] text-ds-text-2 px-1">Mover a fecha exacta</p>
            <Calendar
              mode="single"
              locale={es}
              onSelect={(d) => {
                if (d) moveToDate(d);
              }}
              disabled={busy !== null}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickingDate(false)}
              disabled={busy !== null}
              className="w-full h-8 text-[12px]"
            >
              Cancelar
            </Button>
            {busy === "date" && (
              <div className="flex items-center justify-center gap-1 text-[12px] text-ds-text-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Moviendo...
              </div>
            )}
            {error && <p className="text-[12px] text-status-warn-fg">{error}</p>}
          </div>
        ) : !editing ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(-1)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 1 día
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(1)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                1 día <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(-7)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 1 sem
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(7)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                1 sem <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(-14)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 2 sem
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(14)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                2 sem <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(-30)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 1 mes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shiftDays(30)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                1 mes <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickingDate(true)}
              disabled={busy !== null}
              className="w-full h-8 text-[12px]"
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Fecha exacta...
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftAmount(fmt.format(target.amountClp));
                setEditing(true);
              }}
              disabled={busy !== null}
              className="w-full h-8 text-[12px]"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar monto
            </Button>
            {busy === "shift" && (
              <div className="flex items-center justify-center gap-1 text-[12px] text-ds-text-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Moviendo...
              </div>
            )}
            {error && <p className="text-[12px] text-status-warn-fg">{error}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[12px] text-ds-text-2">Nuevo monto (CLP)</label>
            <Input
              autoFocus
              inputMode="decimal"
              value={draftAmount}
              onChange={(e) => {
                const cleaned = e.target.value
                  .replace(/[^\d,.-]/g, "")
                  .replace(/\./g, "")
                  .replace(",", ".");
                const n = Number(cleaned);
                setDraftAmount(
                  Number.isFinite(n) ? fmt.format(n) : e.target.value,
                );
              }}
              className="h-8 font-mono text-right text-[12px]"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={busy !== null}
                className="flex-1 h-8 text-[12px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveAmount}
                disabled={busy !== null}
                className="flex-1 h-8 text-[12px]"
              >
                {busy === "amount" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
            {error && (
              <p className="text-[12px] text-status-warn-fg">{error}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
