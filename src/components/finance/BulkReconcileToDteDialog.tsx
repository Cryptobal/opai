"use client";

/**
 * BulkReconcileToDteDialog — concilia N movimientos bancarios contra 1 DTE
 * en una sola operación.
 *
 * Caso de uso típico: cliente paga una factura grande en varios depósitos
 * (ej. 3 transferencias para una factura de $300k). El usuario selecciona
 * los 3 mov en /finanzas/bancos y abre este dialog desde la barra masiva.
 *
 * Validaciones cliente (las del server son la fuente de verdad):
 *   - Todos los mov deben ser del mismo signo (ingresos vs egresos).
 *     Si son mixtos, se muestra warning y se deshabilita el confirm.
 *   - Búsqueda y selección del DTE filtra por dirección esperada
 *     (ingreso → ISSUED, egreso → RECEIVED) y status UNPAID/PARTIAL/OVERDUE.
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
  CheckCircle2,
  Circle,
  Loader2,
  Search,
  AlertTriangle,
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
  const [selectedDteId, setSelectedDteId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Validación del lote: signo único.
  const signs = new Set(
    transactions.map((t) => (t.amount > 0 ? "in" : "out"))
  );
  const isMixed = signs.size > 1;
  const isIncome = signs.has("in");
  const totalAlloc = useMemo(
    () => transactions.reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  // Debounce del search.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setCandidates([]);
      setSelectedDteId(null);
    }
  }, [open]);

  // Carga de candidatos: filtra por dirección esperada + status no pagados
  // y, si hay búsqueda, la pasa al endpoint server-side. El endpoint ya
  // sabe filtrar por monto si lo necesitásemos en el futuro.
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
        setCandidates(list);
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
  }, [open, debouncedSearch, isIncome, isMixed, transactions.length]);

  const handleConfirm = async () => {
    if (!selectedDteId) return;
    setConfirming(true);
    try {
      const res = await fetch(
        "/api/finance/banking/transactions/bulk-reconcile-dte",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankTransactionIds: transactions.map((t) => t.id),
            dteId: selectedDteId,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(
        `${json.data.matchedTransactions} mov. conciliados · Recibo ${json.data.paymentRecordCode}`
      );
      onConfirmed();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al conciliar");
    } finally {
      setConfirming(false);
    }
  };

  const selectedDte = candidates.find((c) => c.id === selectedDteId);
  const overflow =
    selectedDte != null && totalAlloc > selectedDte.amountPending + 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar {transactions.length} mov. contra 1 factura</DialogTitle>
          <DialogDescription>
            Crea un recibo de pago por cada movimiento, todos asignados al
            mismo DTE. Útil para cobros o pagos en cuotas.
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
                  {transactions.length} movimientos · {isIncome ? "Ingresos" : "Egresos"}
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

            {/* Búsqueda DTE */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-dte-search">
                Factura {isIncome ? "emitida" : "recibida"}
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
            <div className="border border-border rounded-lg max-h-72 overflow-y-auto">
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
                    const selected = c.id === selectedDteId;
                    const counterparty = isIncome
                      ? c.receiverName
                      : c.issuerName;
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                          selected && "bg-primary/5"
                        )}
                        onClick={() => setSelectedDteId(c.id)}
                      >
                        <div className="shrink-0 pt-0.5">
                          {selected ? (
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

            {/* Resumen + warning si overflow */}
            {selectedDte && (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm space-y-1",
                  overflow
                    ? "border-status-danger-border bg-status-danger-soft/30"
                    : "border-status-ok-border bg-status-ok-soft/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">A asignar</span>
                  <span className="font-mono">
                    {fmtCLP.format(totalAlloc)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Saldo pendiente DTE
                  </span>
                  <span className="font-mono">
                    {fmtCLP.format(selectedDte.amountPending)}
                  </span>
                </div>
                {overflow && (
                  <p className="text-xs text-status-danger-fg pt-1">
                    El total de los mov. supera el saldo pendiente del DTE.
                    Quitá movimientos o elegí otra factura.
                  </p>
                )}
              </div>
            )}
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
              !selectedDteId ||
              overflow ||
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
