"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2, Check, ChevronDown } from "lucide-react";
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
import type { ProjectionBucket, ProjectionRow } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { formatThousands, parseAmount } from "../amount-format";
import { isCurrentBucket } from "../projection-helpers";
import { createManualEntryViaApi } from "./cashflow-create";

/** yyyy-MM-dd de una fecha (ISO string o Date). */
const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/** Concepto elegible en el selector: un nombre real del flujo + su categoría. */
interface ConceptOption {
  name: string;
  categoryId: string | null;
  /** Pista secundaria (cliente / categoría) para desambiguar en la lista. */
  hint?: string;
}

/**
 * Construye las opciones de concepto a partir de las filas reales del flujo,
 * filtradas por tipo (ingreso/egreso).
 *
 * Regla de INGRESOS: al flujo entran los DTE recurrentes (item soberano). El
 * `source=CONTRACT` es un duplicado del contrato — NO se ofrece como concepto
 * (evita listar "Contrato X" o "Ventas por Contrato"). Se listan:
 *   - los ítems/clientes reales de cada categoría (DTE recurrentes, manuales…),
 *   - o, si la categoría no tiene ítems propios, la categoría misma (buckets
 *     manuales tipo "Préstamo de socios", "Otros ingresos").
 * Prefiere el ítem sobre la etiqueta de categoría para no duplicar ("DTE
 * Recurrente" + sus clientes). Los egresos no tienen el problema de CONTRACT.
 */
function buildConceptOptions(
  rows: ProjectionRow[],
  kind: "INCOME" | "EXPENSE",
): ConceptOption[] {
  const seen = new Set<string>();
  const out: ConceptOption[] = [];
  const push = (name: string, categoryId: string | null, hint?: string) => {
    const nm = name.trim();
    if (!nm) return;
    const key = nm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: nm, categoryId, hint: hint?.trim() || undefined });
  };

  for (const row of rows) {
    if (row.kind !== kind) continue;
    const items = row.items ?? [];
    // Ingresos: fuera los ítems de contrato (duplican al DTE recurrente soberano).
    const usable =
      kind === "INCOME" ? items.filter((i) => i.source !== "CONTRACT") : items;
    // Categoría puramente de contrato → no ofrecer nada de ella.
    if (kind === "INCOME" && items.length > 0 && usable.length === 0) continue;

    if (usable.length > 0) {
      for (const it of usable) {
        push(
          it.itemName || "",
          row.categoryId,
          it.crmAccountName || row.categoryName || undefined,
        );
      }
    } else {
      // Categoría sin ítems propios (bucket manual: préstamo socios, otros…).
      push(row.categoryName || "", row.categoryId);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Alta manual de un ingreso/egreso para PROYECTAR a mano en el flujo (ej.
 * mientras la factura real no existe). Crea una cuota MANUAL en la semana
 * elegida; luego se arrastra entre semanas y se borra (ocultar del flujo)
 * cuando ya no hace falta. Reemplaza la necesidad de crear un item de
 * configuración solo para ver una proyección.
 */
export function ManualEntryQuickAdd({
  buckets,
  rows,
  onCreated,
}: {
  /** Semanas visibles, para elegir en cuál cae la cuota. */
  buckets: ProjectionBucket[];
  /** Filas actuales del flujo, para ofrecer los conceptos que ya existen. */
  rows: ProjectionRow[];
  /** Refresca la grilla tras crear (la fila nueva aparece sola). */
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [name, setName] = useState("");
  /** Categoría del concepto elegido; null cuando el concepto es libre. */
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [rawAmount, setRawAmount] = useState("");

  const conceptOptions = useMemo(
    () => buildConceptOptions(rows, kind),
    [rows, kind],
  );
  const filteredOptions = useMemo(() => {
    const q = name.trim().toLowerCase();
    const base = q
      ? conceptOptions.filter((o) => o.name.toLowerCase().includes(q))
      : conceptOptions;
    return base.slice(0, 40);
  }, [conceptOptions, name]);
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
    setCategoryId(null);
    setSuggestOpen(false);
    setRawAmount("");
    setKind("INCOME");
  }

  /** Cambia ingreso/egreso: los conceptos difieren, así que limpia la selección. */
  function selectKind(k: "INCOME" | "EXPENSE") {
    setKind(k);
    setName("");
    setCategoryId(null);
    setSuggestOpen(false);
  }

  function pickConcept(opt: ConceptOption) {
    setName(opt.name);
    setCategoryId(opt.categoryId);
    setSuggestOpen(false);
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
      // Si el concepto salió del selector, hereda su categoría → la fila cae en
      // la sección correcta y no al fondo de la categoría por defecto.
      categoryId,
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
                  onClick={() => selectKind(k)}
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

            {/* Concepto — selector de los conceptos que ya existen en el flujo
                (clientes/contratos para ingresos; sueldos/previred/etc para
                egresos). También se puede escribir uno nuevo. */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ds-text-3">
                Concepto
                <span className="ml-1 text-ds-text-3/70">
                  · {kind === "INCOME" ? "cliente / contrato" : "tipo de egreso"}
                </span>
              </span>
              <div className="relative">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setCategoryId(null);
                    setSuggestOpen(true);
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  placeholder={
                    kind === "INCOME"
                      ? "Buscar cliente o escribir concepto…"
                      : "Buscar egreso o escribir concepto…"
                  }
                  maxLength={200}
                  className="h-10 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 pr-9 text-[13px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setSuggestOpen((v) => !v)}
                  className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-ds-text-3 hover:text-ds-text-1"
                  aria-label="Ver conceptos"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", suggestOpen && "rotate-180")} />
                </button>

                {suggestOpen && filteredOptions.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-ds-md border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg">
                    {filteredOptions.map((opt) => {
                      const active = opt.name.toLowerCase() === name.trim().toLowerCase();
                      return (
                        <button
                          key={`${opt.name}-${opt.categoryId ?? "x"}`}
                          type="button"
                          onClick={() => pickConcept(opt)}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-ds-surface-2",
                            active ? "text-ds-text-1" : "text-ds-text-2",
                          )}
                        >
                          <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100 text-status-ok-fg" : "opacity-0")} />
                          <span className="min-w-0 flex-1 truncate">{opt.name}</span>
                          {opt.hint && opt.hint.toLowerCase() !== opt.name.toLowerCase() && (
                            <span className="shrink-0 truncate text-[11px] text-ds-text-3">{opt.hint}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {name.trim() && categoryId === null && (
                <span className="text-[11px] text-ds-text-3">
                  Concepto nuevo · caerá en la categoría general de {kind === "INCOME" ? "ingresos" : "egresos"}
                </span>
              )}
            </div>

            {/* Monto */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-ds-text-3">Monto (CLP)</span>
              <input
                value={rawAmount}
                inputMode="numeric"
                onFocus={() => setSuggestOpen(false)}
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
