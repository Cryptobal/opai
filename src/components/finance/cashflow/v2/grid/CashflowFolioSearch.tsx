"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, EyeOff } from "lucide-react";
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
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { isCurrentBucket } from "../projection-helpers";

interface DteFlowSearchResult {
  dteId: string;
  folio: number;
  receiverName: string | null;
  totalAmount: number;
  emissionDate: string;
  placementDate: string;
  weekKey: string;
  weekLabel: string;
  hiddenFromFlow: boolean;
}

interface Props {
  /** Semanas actualmente visibles (para ofrecerlas como destino rápido). */
  buckets: ProjectionBucket[];
  canManage: boolean;
  /** Mueve la factura a la fecha (lunes de la semana destino) y refresca. */
  onRun: (dteId: string, date: Date) => Promise<{ ok: boolean; error?: string }>;
  /** Navega la ventana para mostrar la semana de `date` sin mover nada. */
  onLocate: (date: Date) => void;
}

/**
 * Buscador de facturas por folio (o cliente) para el Flujo de caja. Encuentra
 * facturas AUNQUE no estén en la ventana visible y permite "correrlas" a una
 * semana en un clic. Resuelve el caso de facturas que quedaron fuera de vista.
 */
export function CashflowFolioSearch({ buckets, canManage, onRun, onLocate }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DteFlowSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DteFlowSearchResult | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce del fetch: 250ms tras el último tecleo.
  useEffect(() => {
    const term = q.trim();
    if (term.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/finance/cashflow/dte-search?q=${encodeURIComponent(term)}`,
        );
        const j = await res.json();
        if (cancelled) return;
        setResults(j.success ? (j.data as DteFlowSearchResult[]) : []);
        setOpen(true);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  // Cerrar el dropdown al clic fuera.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function runTo(bucketStart: Date) {
    if (!selected) return;
    const dteId = selected.dteId;
    // Cerramos el modal AL INSTANTE; el move + refresh de la grilla corren en
    // background (onRun usa refreshAt, que re-trae fresca la semana destino y
    // ancla ahí). Así el cambio se ve reflejado solo, sin recargar la página.
    setSelected(null);
    setQ("");
    setResults([]);
    setOpen(false);
    await onRun(dteId, bucketStart); // el toast (éxito/error) lo emite onRun
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-text-3" />
      <input
        type="text"
        inputMode="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar factura por folio o cliente…"
        aria-label="Buscar factura por folio o cliente"
        className="h-9 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-1 pl-8 pr-8 text-ds-body placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {loading ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ds-text-3" />
      ) : q ? (
        <button
          type="button"
          onClick={() => setQ("")}
          aria-label="Limpiar"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-text-3 hover:text-ds-text-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-[22rem] max-w-[90vw] overflow-auto rounded-ds-md border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-ds-body text-ds-text-3">
              {loading ? "Buscando…" : "Sin resultados"}
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.dteId}
                type="button"
                onClick={() => {
                  setSelected(r);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-ds-surface-2"
              >
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-ds-text-2">
                  N° {r.folio}
                </span>
                <span className="min-w-0 flex-1 truncate text-ds-body text-ds-text-1">
                  {r.receiverName ?? "—"}
                </span>
                {r.hiddenFromFlow && (
                  <EyeOff className="h-3 w-3 shrink-0 text-ds-text-3" aria-label="Oculta del flujo" />
                )}
                <span className="shrink-0 text-[11px] text-ds-text-3">{r.weekLabel}</span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-ds-text-2">
                  {fmt.format(r.totalAmount)}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Factura N° {selected.folio}
                  {selected.hiddenFromFlow ? " · oculta del flujo" : ""}
                </DialogTitle>
                <DialogDescription className="leading-relaxed">
                  {selected.receiverName ?? "—"} · {fmt.format(selected.totalAmount)}
                  <br />
                  Hoy está en la semana <strong>{selected.weekLabel}</strong> (emitida{" "}
                  {selected.emissionDate}).
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onLocate(toDate(selected.placementDate));
                    setSelected(null);
                    setQ("");
                    setOpen(false);
                  }}
                  className="rounded-ds-md border border-ds-border-default px-3 py-2 text-left text-ds-body text-ds-text-2 transition-colors hover:bg-ds-surface-2"
                >
                  Ir a su semana ({selected.weekLabel})
                </button>

                {canManage && (
                  <>
                    <p className="pt-1 text-[12px] font-medium text-ds-text-2">
                      O córrela a una de estas semanas:
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {buckets.map((b) => {
                        // "aquí" = la semana donde HOY está la factura (primary,
                        // rellena). "hoy" = la semana actual del calendario, para
                        // ubicarla de un vistazo al decidir a cuál correrla.
                        const isHere = b.key === selected.weekKey;
                        const isNow = isCurrentBucket(b);
                        return (
                          <Button
                            key={b.key}
                            size="sm"
                            variant={isHere ? "default" : "outline"}
                            onClick={() => runTo(toDate(b.start))}
                            className={cn(
                              "justify-start text-[12px]",
                              isHere && "ring-1 ring-primary",
                              // Semana actual (no la de la factura): borde y
                              // texto de acento para identificarla sin rellenar.
                              !isHere &&
                                isNow &&
                                "border-primary text-primary ring-1 ring-primary/40",
                            )}
                          >
                            {b.label}
                            {isHere ? " · aquí" : isNow ? " · hoy" : ""}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
