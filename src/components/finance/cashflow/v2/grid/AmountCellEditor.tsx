"use client";

import { useState } from "react";
import { RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatThousands, parseAmount } from "../amount-format";
import {
  saveOccurrenceAmount,
  saveGroupAmount,
  revertAmount,
  type AmountResult,
} from "./cashflow-amount";

/**
 * Editor inline del monto de una celda (B4B). Se abre con doble-clic / doble-tap
 * sobre la casilla (no pelea con el long-press del drag). Prefill con el monto
 * actual, Enter guarda, Esc/tap-fuera cancela. Para una celda de grupo edita el
 * TOTAL y el reparto proporcional lo hace `saveGroupAmount`. Si la celda ya
 * tiene override manual permite revertir al valor calculado.
 */
export function AmountCellEditor({
  currentAmount,
  isGroup,
  occurrenceId,
  groupOccurrences,
  hasOverride,
  onClose,
  onSaved,
}: {
  currentAmount: number;
  isGroup: boolean;
  occurrenceId: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
  hasOverride: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [raw, setRaw] = useState(() => formatThousands(String(Math.round(currentAmount))));
  const [busy, setBusy] = useState(false);

  function finish(res: AmountResult, okMsg: string) {
    if (res.ok) {
      toast.success(res.error ? `${okMsg} · ${res.error}` : okMsg);
      onSaved();
      onClose();
    } else {
      toast.error(res.error ?? "No se pudo guardar");
    }
  }

  async function save() {
    const amount = parseAmount(raw);
    if (!amount || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    if (amount === Math.round(currentAmount)) {
      onClose();
      return;
    }
    setBusy(true);
    const res = isGroup
      ? await saveGroupAmount(groupOccurrences ?? [], amount)
      : occurrenceId
        ? await saveOccurrenceAmount(occurrenceId, amount)
        : { ok: false, error: "Cuota sin materializar" };
    setBusy(false);
    finish(res, "Monto actualizado");
  }

  async function revert() {
    setBusy(true);
    const ids = isGroup
      ? (groupOccurrences ?? []).map((o) => o.id)
      : occurrenceId
        ? [occurrenceId]
        : [];
    const res = await revertAmount(ids);
    setBusy(false);
    finish(res, "Monto restaurado");
  }

  // Mini-diálogo centrado (fixed) para no ser recortado por el `overflow-auto`
  // de la grilla ni pelear con las columnas sticky. Backdrop tenue captura el
  // tap-fuera. Touch targets ≥ 44px.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onDoubleClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-[240px] flex-col gap-2 rounded-ds-lg border border-ds-border-strong bg-ds-surface-1 p-3 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ds-text-3">
          {isGroup ? "Editar total de la semana" : "Editar monto"}
        </span>
        <input
          autoFocus
          value={raw}
          inputMode="numeric"
          onChange={(e) => setRaw(formatThousands(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onClose();
          }}
          className="h-11 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-3 text-right font-mono text-[15px] tabular-nums text-ds-text-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {isGroup && (
          <span className="text-[12px] text-ds-text-3">
            Se reparte proporcional entre las instalaciones.
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-ds-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Guardar
          </button>
          {hasOverride && (
            <button
              type="button"
              onClick={() => void revert()}
              disabled={busy}
              title="Revertir al monto calculado"
              className={cn(
                "inline-flex h-11 items-center justify-center gap-1.5 rounded-ds-md border border-ds-border-default px-3 text-[12px] text-ds-text-2 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-50",
              )}
            >
              <RotateCcw className="h-4 w-4" /> Revertir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
