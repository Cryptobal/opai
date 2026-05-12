"use client";

/**
 * BulkReconcileToDteDialog — concilia N movimientos bancarios contra M DTEs
 * en una sola operación.
 *
 * Casos de uso:
 *   - N depósitos → 1 factura: cliente paga una factura grande en partes.
 *   - 1 depósito de factoring → M facturas cedidas (caso AMIFACTOR).
 *   - N → M libre: el usuario elige los DTEs y reparte el total.
 *
 * UX:
 *   - Multi-select de DTEs candidatos.
 *   - Por cada DTE seleccionado, input de monto editable.
 *   - Default: prorrateo automático según `amountPending` (acotado al
 *     pendiente de cada uno). El usuario puede ajustar manualmente.
 *   - Validación: suma de allocations ≈ suma de movs (±$1).
 */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  formatCLPInput,
  parseCLPInput,
} from "@/lib/finance/format-clp-input";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Search,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

interface BankTxLite {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface DteCandidate {
  id: string;
  dteType: number;
  folio: number;
  date: string;
  totalAmount: number;
  amountPaid: number;
  amountPending: number;
  paymentStatus: string;
  receiverName?: string | null;
  issuerName?: string | null;
  issuerRut?: string | null;
  receiverRut?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Movimientos seleccionados a conciliar juntos. */
  transactions: BankTxLite[];
  onConfirmed: () => void;
}

/**
 * Estado por DTE seleccionado: monto a asignar como string (input) +
 * lockeado por el usuario (true = no recalcular en re-balance automático).
 */
interface DteAllocation {
  dte: DteCandidate;
  amountInput: string;
  manuallyEdited: boolean;
}

export function BulkReconcileToDteDialog({
  open,
  onOpenChange,
  transactions,
  onConfirmed,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidates, setCandidates] = useState<DteCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DteAllocation[]>([]);
  const [confirming, setConfirming] = useState(false);

  const signs = new Set(
    transactions.map((t) => (t.amount > 0 ? "in" : "out"))
  );
  const isMixed = signs.size > 1;
  const isIncome = signs.has("in");
  const totalAlloc = useMemo(
    () => transactions.reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setCandidates([]);
      setSelected([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isMixed || transactions.length === 0) return;
    const ctrl = new AbortController();
    const route = isIncome
      ? "/api/finance/billing/issued"
      : "/api/finance/billing/received";
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", "30");
    params.set("paymentStatus", "UNPAID,PARTIAL,OVERDUE");
    params.set("periodo", "ALL");
    if (debouncedSearch) params.set("search", debouncedSearch);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${route}?${params.toString()}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error);
        const list: DteCandidate[] = (json.data?.dtes ?? []).map(
          (d: Record<string, unknown>) => ({
            id: String(d.id),
            dteType: Number(d.dteType),
            folio: Number(d.folio),
            date: String(d.date ?? d.createdAt),
            totalAmount: Number(d.totalAmount),
            amountPaid: Number(d.amountPaid ?? 0),
            amountPending: Number(d.amountPending ?? d.totalAmount),
            paymentStatus: String(d.paymentStatus ?? "UNPAID"),
            receiverName: (d.receiverName as string | null) ?? null,
            issuerName: (d.issuerName as string | null) ?? null,
            issuerRut: (d.issuerRut as string | null) ?? null,
            receiverRut: (d.receiverRut as string | null) ?? null,
          })
        );

        // Sort por afinidad de monto al total de movs.
        const exactWindow = 1;
        const nearWindow = totalAlloc * 0.02;
        const sorted = [...list].sort((a, b) => {
          const da = Math.abs(a.amountPending - totalAlloc);
          const db = Math.abs(b.amountPending - totalAlloc);
          const ta = da <= exactWindow ? 0 : da <= nearWindow ? 1 : 2;
          const tb = db <= exactWindow ? 0 : db <= nearWindow ? 1 : 2;
          if (ta !== tb) return ta - tb;
          if (ta < 2) return da - db;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        setCandidates(sorted);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error(
            err instanceof Error ? err.message : "Error al cargar facturas"
          );
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [open, debouncedSearch, isIncome, isMixed, transactions.length, totalAlloc]);

  /**
   * Rebalancea los DTEs no-editados manualmente para que la suma cubra
   * `remaining` (el faltante después de los manualmente fijados).
   * Reparto proporcional al `amountPending` de cada DTE auto, acotado.
   */
  const rebalance = (list: DteAllocation[]): DteAllocation[] => {
    const manual = list.filter((a) => a.manuallyEdited);
    const auto = list.filter((a) => !a.manuallyEdited);
    const manualSum = manual.reduce(
      (s, a) => s + (parseCLPInput(a.amountInput) ?? 0),
      0
    );
    let remaining = Math.max(0, totalAlloc - manualSum);
    if (auto.length === 0) return list;

    const totalPending = auto.reduce((s, a) => s + a.dte.amountPending, 0);
    const updatedAuto = auto.map((a, i) => {
      const share = totalPending > 0 ? a.dte.amountPending / totalPending : 1 / auto.length;
      const isLast = i === auto.length - 1;
      let piece = isLast ? remaining : Math.round(remaining * share);
      piece = Math.min(piece, a.dte.amountPending);
      remaining -= piece;
      return { ...a, amountInput: formatCLPInput(String(piece)) };
    });

    return list.map((a) =>
      a.manuallyEdited
        ? a
        : updatedAuto.find((u) => u.dte.id === a.dte.id) ?? a
    );
  };

  const toggleSelect = (c: DteCandidate) => {
    setSelected((prev) => {
      const exists = prev.find((a) => a.dte.id === c.id);
      if (exists) {
        return rebalance(prev.filter((a) => a.dte.id !== c.id));
      }
      const next = [
        ...prev,
        { dte: c, amountInput: "", manuallyEdited: false },
      ];
      return rebalance(next);
    });
  };

  const updateAmount = (dteId: string, raw: string) => {
    const formatted = formatCLPInput(raw);
    setSelected((prev) =>
      prev.map((a) =>
        a.dte.id === dteId
          ? { ...a, amountInput: formatted, manuallyEdited: true }
          : a
      )
    );
  };

  const totalAssigned = selected.reduce(
    (s, a) => s + (parseCLPInput(a.amountInput) ?? 0),
    0
  );
  const delta = totalAlloc - totalAssigned;
  const isBalanced = Math.abs(delta) <= 1;
  const overflowing = selected.some((a) => {
    const v = parseCLPInput(a.amountInput) ?? 0;
    return v > a.dte.amountPending + 0.01;
  });

  const handleConfirm = async () => {
    if (selected.length === 0 || !isBalanced || overflowing) return;
    setConfirming(true);
    try {
      const res = await fetch(
        "/api/finance/banking/transactions/bulk-reconcile-dtes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankTransactionIds: transactions.map((t) => t.id),
            allocations: selected.map((a) => ({
              dteId: a.dte.id,
              amount: parseCLPInput(a.amountInput) ?? 0,
            })),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(
        `${json.data.matchedTransactions} mov. conciliados contra ${json.data.affectedDtes} factura${json.data.affectedDtes === 1 ? "" : "s"}`
      );
      onConfirmed();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al conciliar");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Conciliar {transactions.length} mov.{" "}
            {selected.length > 0
              ? `contra ${selected.length} factura${selected.length === 1 ? "" : "s"}`
              : "contra facturas"}
          </DialogTitle>
          <DialogDescription>
            Seleccioná una o más facturas y ajustá el monto a asignar a cada
            una. Útil para cobros parciales o depósitos de factoring que
            cubren múltiples cesiones.
          </DialogDescription>
        </DialogHeader>

        {isMixed ? (
          <div className="rounded-lg border border-status-danger-border bg-status-danger-soft/30 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-danger-fg mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-status-danger-fg">
                Selección mezclada
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No se pueden conciliar juntos ingresos y egresos. Filtrá por
                tipo en la lista de movimientos y reintentá.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Resumen del lote */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {transactions.length} movimientos ·{" "}
                  {isIncome ? "Ingresos" : "Egresos"}
                </span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    isIncome ? "text-status-ok-fg" : "text-status-danger-fg"
                  )}
                >
                  {fmtCLP.format(isIncome ? totalAlloc : -totalAlloc)}
                </span>
              </div>
              <ul className="text-xs text-muted-foreground max-h-24 overflow-y-auto space-y-0.5">
                {transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {format(new Date(t.transactionDate), "dd MMM", {
                        locale: es,
                      })}{" "}
                      · {t.description}
                    </span>
                    <span className="font-mono shrink-0">
                      {fmtCLP.format(Math.abs(t.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* DTEs ya seleccionados con sus inputs de monto */}
            {selected.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  Facturas seleccionadas ({selected.length})
                </p>
                <ul className="space-y-2">
                  {selected.map((a) => {
                    const counterparty = isIncome
                      ? a.dte.receiverName
                      : a.dte.issuerName;
                    const v = parseCLPInput(a.amountInput) ?? 0;
                    const over = v > a.dte.amountPending + 0.01;
                    return (
                      <li
                        key={a.dte.id}
                        className={cn(
                          "rounded-lg border p-2.5 flex items-center gap-2",
                          over
                            ? "border-status-danger-border bg-status-danger-soft/20"
                            : "border-border"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              Tipo {a.dte.dteType} · F{a.dte.folio}
                            </span>
                            <Badge variant="outline" className="text-[11px]">
                              {a.dte.paymentStatus}
                            </Badge>
                            {a.manuallyEdited && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-primary/10 text-primary border-primary/30"
                              >
                                Editado
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {counterparty ?? "—"} · Pendiente{" "}
                            <span className="font-mono">
                              {fmtCLP.format(a.dte.amountPending)}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Input
                            value={a.amountInput}
                            onChange={(e) =>
                              updateAmount(a.dte.id, e.target.value)
                            }
                            className="h-9 w-32 text-right font-mono text-sm"
                            placeholder="0"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSelect(a.dte)}
                            className="h-9 px-2"
                            aria-label="Quitar"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Resumen de balance */}
                <div
                  className={cn(
                    "rounded-lg border p-3 text-sm flex items-center justify-between",
                    isBalanced && !overflowing
                      ? "border-status-ok-border bg-status-ok-soft/30"
                      : "border-status-warn-border bg-status-warn-soft/30"
                  )}
                >
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      Asignado:{" "}
                      <span className="font-mono">
                        {fmtCLP.format(totalAssigned)}
                      </span>{" "}
                      de{" "}
                      <span className="font-mono">
                        {fmtCLP.format(totalAlloc)}
                      </span>
                    </p>
                    {!isBalanced && (
                      <p className="text-status-warn-fg">
                        {delta > 0
                          ? `Falta asignar ${fmtCLP.format(delta)}`
                          : `Excede en ${fmtCLP.format(-delta)}`}
                      </p>
                    )}
                    {overflowing && (
                      <p className="text-status-danger-fg">
                        Una asignación supera el saldo pendiente de su
                        factura. Ajustala.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Búsqueda DTE */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-dte-search">
                Agregar factura {isIncome ? "emitida" : "recibida"}
              </Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="bulk-dte-search"
                  placeholder={
                    isIncome
                      ? "Buscar por folio, cliente o RUT…"
                      : "Buscar por folio, proveedor o RUT…"
                  }
                  className="h-10 sm:h-9 pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Lista candidatos */}
            <div className="border border-border rounded-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {debouncedSearch
                    ? "Sin coincidencias para tu búsqueda."
                    : "Buscá por folio, RUT o nombre para ver candidatos."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {candidates.map((c) => {
                    const isSelected = selected.some(
                      (a) => a.dte.id === c.id
                    );
                    const counterparty = isIncome
                      ? c.receiverName
                      : c.issuerName;
                    const deltaC = Math.abs(c.amountPending - totalAlloc);
                    const isExactMatch = deltaC <= 1;
                    const isNearMatch =
                      !isExactMatch && deltaC <= totalAlloc * 0.02;
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                          isSelected && "bg-primary/5",
                          isExactMatch && !isSelected && "bg-status-ok-soft/30"
                        )}
                        onClick={() => toggleSelect(c)}
                      >
                        <div className="shrink-0 pt-0.5">
                          {isSelected ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              Tipo {c.dteType} · F{c.folio}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {c.paymentStatus}
                            </Badge>
                            {isExactMatch && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                              >
                                Match exacto
                              </Badge>
                            )}
                            {isNearMatch && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-status-warn-soft text-status-warn-fg border-status-warn-border"
                              >
                                ≈ {fmtCLP.format(deltaC)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {counterparty ?? "—"}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(c.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            <div className="text-right">
                              <p className="font-mono text-sm font-medium">
                                {fmtCLP.format(c.amountPending)}
                              </p>
                              {c.amountPending !== c.totalAmount && (
                                <p className="text-[11px] text-muted-foreground">
                                  de {fmtCLP.format(c.totalAmount)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isMixed ||
              selected.length === 0 ||
              !isBalanced ||
              overflowing ||
              confirming ||
              transactions.length === 0
            }
          >
            {confirming && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
