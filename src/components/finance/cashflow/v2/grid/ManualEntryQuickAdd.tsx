"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { formatThousands, parseAmount } from "../amount-format";
import { isCurrentBucket } from "../projection-helpers";
import { createManualEntryViaApi } from "./cashflow-create";

/** yyyy-MM-dd de una fecha (ISO string o Date). */
const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/**
 * Alta manual de un ingreso/egreso para PROYECTAR a mano en el flujo (ej.
 * mientras la factura real no existe). Crea una cuota MANUAL en la semana
 * elegida; luego se arrastra entre semanas y se borra (ocultar del flujo)
 * cuando ya no hace falta. Reemplaza la necesidad de crear un item de
 * configuración solo para ver una proyección.
 */
export function ManualEntryQuickAdd({
  buckets,
  onCreated,
}: {
  /** Semanas visibles, para elegir en cuál cae la cuota. */
  buckets: ProjectionBucket[];
  /** Refresca la grilla tras crear (la fila nueva aparece sola). */
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [name, setName] = useState("");
  const [rawAmount, setRawAmount] = useState("");
  const currentKey = useMemo(
    () => buckets.find((b) => isCurrentBucket(b))?.key ?? buckets[0]?.key ?? "",
    [buckets],
  );
  const [bucketKey, setBucketKey] = useState(currentKey);
  const [busy, setBusy] = useState(false);

  // Al abrir, ancla la semana en la actual (o la primera visible) por si la
  // ventana cambió desde el último render.
  function openDialog() {
    setBucketKey(currentKey);
    setOpen(true);
  }

  function reset() {
    setName("");
    setRawAmount("");
    setKind("INCOME");
  }

  async function submit() {
    const amount = parseAmount(rawAmount);
    const concept = name.trim();
    const bucket = buckets.find((b) => b.key === bucketKey);
    if (!concept) {
      toast.error("Indica un concepto");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    if (!bucket) {
      toast.error("Elige una semana");
      return;
    }
    setBusy(true);
    const res = await createManualEntryViaApi({
      kind,
      name: concept,
      amountClp: amount,
      scheduledDate: ymd(bucket.start),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear");
      return;
    }
    toast.success(
      `${kind === "INCOME" ? "Ingreso" : "Egreso"} manual agregado en ${bucket.label}`,
    );
    setOpen(false);
    reset();
    await onCreated();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="Agregar ingreso o egreso manual para proyectar"
        className="inline-flex h-9 items-center gap-1.5 rounded-ds-md border border-ds-border-default px-2.5 text-[12px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1"
      >
        <Plus className="h-3.5 w-3.5" /> Manual
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar movimiento manual</DialogTitle>
            <DialogDescription>
              Proyecta un ingreso o egreso a mano. Queda como fila propia:
              podés arrastrarlo entre semanas y ocultarlo del flujo cuando ya
              tengas la factura.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-1.5">
              {(["INCOME", "EXPENSE"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "h-9 rounded-ds-md border text-[13px] transition-colors",
                    kind === k
                      ? k === "INCOME"
                        ? "border-status-ok-fg bg-status-ok-soft text-status-ok-fg"
                        : "border-status-warn-fg bg-status-warn-soft text-status-warn-fg"
                      : "border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
                  )}
                >
                  {k === "INCOME" ? "Ingreso" : "Egreso"}
                </button>
              ))}
            </div>

            {/* Concepto */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-ds-text-3">Concepto</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Anticipo Polpaico"
                maxLength={200}
                className="h-10 rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            {/* Monto */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-ds-text-3">Monto (CLP)</span>
              <input
                value={rawAmount}
                inputMode="numeric"
                onChange={(e) => setRawAmount(formatThousands(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="0"
                className="h-10 rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-3 text-right font-mono text-[15px] tabular-nums text-ds-text-1 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            {/* Semana */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ds-text-3">Semana</span>
              <div className="grid grid-cols-2 gap-1.5">
                {buckets.map((b) => {
                  const selected = b.key === bucketKey;
                  const isNow = isCurrentBucket(b);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBucketKey(b.key)}
                      className={cn(
                        "h-9 rounded-ds-md border px-2 text-left text-[12px] transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-ds-text-1 ring-1 ring-primary"
                          : "border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
                      )}
                    >
                      {b.label}
                      {isNow ? " · hoy" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
