"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatThousands, parseAmount } from "../amount-format";
import {
  revertInlineEdit,
  saveInlineCreate,
  saveInlineEdit,
} from "./inline-cell-save";

export type InlineEditorMode = "edit" | "create";

/**
 * Editor inline de celda: modo `edit` (monto) o `create` (vacía).
 * Enter confirma · Esc cancela · Tab (create) confirma y salta de semana.
 */
export function InlineCellEditor({
  mode,
  currentAmount = 0,
  isGroup = false,
  occurrenceId = null,
  groupOccurrences,
  hasOverride = false,
  itemId,
  itemName,
  kind,
  categoryId,
  scheduledDate,
  onClose,
  onSaved,
  onCreated,
  onTabNext,
}: {
  mode: InlineEditorMode;
  currentAmount?: number;
  isGroup?: boolean;
  occurrenceId?: string | null;
  groupOccurrences?: { id: string; amountClp: number }[];
  hasOverride?: boolean;
  itemId: string;
  itemName: string;
  kind: "INCOME" | "EXPENSE";
  categoryId?: string | null;
  scheduledDate: string;
  onClose: () => void;
  onSaved: (optimisticAmount?: number) => void;
  onCreated?: (patch: { itemId: string; amount: number }) => void;
  onTabNext?: () => void;
}) {
  const [raw, setRaw] = useState(() =>
    mode === "edit" ? formatThousands(String(Math.round(currentAmount))) : "",
  );
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    inputRef.current?.scrollIntoView({ block: "center" });
  }, []);

  async function saveEdit() {
    const amount = parseAmount(raw);
    if (!amount || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    setBusy(true);
    const { res, optimistic, noop } = await saveInlineEdit({
      amount,
      currentAmount,
      isGroup,
      occurrenceId,
      groupOccurrences,
    });
    setBusy(false);
    if (noop) {
      onClose();
      return;
    }
    if (res.ok) {
      toast.success(res.error ? `Monto actualizado · ${res.error}` : "Monto actualizado");
      onSaved(optimistic);
      onClose();
    } else toast.error(res.error ?? "No se pudo guardar");
  }

  async function revert() {
    setBusy(true);
    const res = await revertInlineEdit({ isGroup, occurrenceId, groupOccurrences });
    setBusy(false);
    if (res.ok) {
      toast.success("Monto restaurado");
      onSaved();
      onClose();
    } else toast.error(res.error ?? "No se pudo guardar");
  }

  async function saveCreate(thenTab: boolean) {
    const amount = parseAmount(raw);
    if (!amount || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    setBusy(true);
    const res = await saveInlineCreate({
      amount,
      itemId,
      itemName,
      kind,
      categoryId,
      scheduledDate,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear");
      return;
    }
    toast.success("Cuota agregada");
    onCreated?.({ itemId, amount });
    onClose();
    if (thenTab) onTabNext?.();
  }

  function requestClose() {
    if (closing.current || busy) return;
    closing.current = true;
    setTimeout(() => onClose(), 120);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh] sm:items-center sm:pt-4"
      onClick={requestClose}
      onDoubleClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-[240px] flex-col gap-2 rounded-ds-lg border border-ds-border-strong bg-ds-surface-1 p-3 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ds-text-3">
          {mode === "create"
            ? kind === "INCOME"
              ? "Agregar ingreso"
              : "Agregar egreso"
            : isGroup
              ? "Editar total de la semana"
              : "Editar monto"}
        </span>
        <input
          ref={inputRef}
          autoFocus
          value={raw}
          inputMode="numeric"
          onChange={(e) => setRaw(formatThousands(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter") {
              e.preventDefault();
              void (mode === "create" ? saveCreate(false) : saveEdit());
            }
            if (e.key === "Tab" && mode === "create") {
              e.preventDefault();
              void saveCreate(true);
            }
          }}
          className="h-11 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-3 text-right font-mono text-[15px] tabular-nums text-ds-text-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {mode === "create" && (
          <span className="text-[12px] text-ds-text-3">
            Enter crea · Tab salta a la semana siguiente
          </span>
        )}
        {isGroup && mode === "edit" && (
          <span className="text-[12px] text-ds-text-3">
            Se reparte proporcional entre las instalaciones.
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void (mode === "create" ? saveCreate(false) : saveEdit())
            }
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-ds-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />{" "}
            {mode === "create" ? "Crear" : "Guardar"}
          </button>
          {mode === "edit" && hasOverride && (
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
