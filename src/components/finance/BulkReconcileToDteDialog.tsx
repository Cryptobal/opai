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
 * UX (post 2026-05):
 *   - Multi-select de DTEs candidatos (incluye nombre de instalación cuando
 *     existe, para distinguir contratos del mismo cliente).
 *   - Por cada DTE seleccionado, input de monto editable.
 *   - Default: prorrateo automático WATER-FILLING. Si una factura se topea
 *     en su `amountPending`, el excedente se redistribuye a las demás
 *     facturas no-topeadas hasta agotar el total a asignar.
 *   - Cuando hay diferencia entre el total bancario y la suma asignada
 *     a facturas, el usuario puede elegir una cuenta contable para
 *     absorber esa diferencia (típicamente comisión de factoring). El
 *     monto se reparte por movimiento y se contabiliza prorrateando entre
 *     los centros de costo (`FinanceDteLine.accountId`) de las facturas
 *     seleccionadas, ponderado por la asignación de cada factura.
 *   - Layout: header + footer sticky, body scrolleable. Inputs anchos
 *     para que el monto formateado no se recorte.
 */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountPlanCombobox } from "./AccountPlanCombobox";
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
  MapPin,
  Building2,
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
  /** Nombre de la instalación / centro de costo asociado. */
  installationName?: string | null;
  installationCommune?: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Movimientos seleccionados a conciliar juntos. */
  transactions: BankTxLite[];
  /** Plan de cuentas para la combobox de absorber diferencias. */
  accountPlans: AccountOption[];
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

/**
 * Water-filling iterativo: distribuye `total` entre items proporcional
 * al `cap` de cada uno, respetando los caps individuales. Si un item
 * se topea, el excedente se redistribuye en la siguiente vuelta entre
 * los items no-topeados. Converge en ≤ N iteraciones.
 *
 * Retorna { piece: number } por cada item, en el mismo orden de entrada.
 */
function waterFill(
  total: number,
  caps: number[],
  fixed: Array<number | null>,
): number[] {
  const n = caps.length;
  const result = new Array<number>(n).fill(0);
  const isFixed = fixed.map((v) => v !== null);
  // Los fijos consumen directo (acotados a su cap).
  for (let i = 0; i < n; i += 1) {
    if (isFixed[i]) {
      result[i] = Math.min(Math.max(fixed[i] ?? 0, 0), caps[i]);
    }
  }
  let remaining =
    total - result.reduce((s, v, i) => (isFixed[i] ? s + v : s), 0);
  if (remaining <= 0) return result;

  // Iteramos sobre los no-fijos hasta convergencia o cap saturado.
  // En cada pasada repartimos `remaining` proporcional al `cap` restante
  // de cada item; los que toquen cap se congelan y la diferencia se
  // redistribuye en la siguiente pasada.
  let active = Array.from({ length: n }, (_, i) => (!isFixed[i] ? i : -1)).filter(
    (i) => i !== -1,
  );
  for (let guard = 0; guard < n + 1; guard += 1) {
    if (active.length === 0 || remaining <= 0) break;
    const capsSum = active.reduce((s, i) => s + caps[i], 0);
    if (capsSum <= 0) break;
    const newActive: number[] = [];
    let consumedThisPass = 0;
    for (const i of active) {
      const share = caps[i] / capsSum;
      const ideal = remaining * share;
      const piece = Math.min(ideal, caps[i] - result[i]);
      result[i] += piece;
      consumedThisPass += piece;
      if (result[i] < caps[i] - 0.5) newActive.push(i);
    }
    remaining -= consumedThisPass;
    // Corrección de redondeo: si todos los activos se saturaron pero
    // queda < $1, no vale otra pasada.
    if (consumedThisPass < 0.5) break;
    active = newActive;
  }

  // Distribución final del residuo por redondeo entre los activos.
  if (active.length > 0 && remaining > 0.5) {
    const last = active[active.length - 1];
    const room = caps[last] - result[last];
    const extra = Math.min(room, remaining);
    result[last] += extra;
  }

  // Redondeamos cada pieza a entero (CLP no usa decimales) preservando el total.
  let roundedSum = 0;
  for (let i = 0; i < n; i += 1) {
    result[i] = Math.round(result[i]);
    roundedSum += result[i];
  }
  // Ajustamos diferencia de redondeo en el último activo no-topeado.
  const diff = Math.round(total) - roundedSum;
  if (diff !== 0) {
    for (let i = n - 1; i >= 0; i -= 1) {
      if (isFixed[i]) continue;
      const newVal = result[i] + diff;
      if (newVal >= 0 && newVal <= caps[i]) {
        result[i] = newVal;
        break;
      }
    }
  }
  return result;
}

export function BulkReconcileToDteDialog({
  open,
  onOpenChange,
  transactions,
  accountPlans,
  onConfirmed,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidates, setCandidates] = useState<DteCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DteAllocation[]>([]);
  const [confirming, setConfirming] = useState(false);
  // Diferencia: cuenta contable + flag para prorratear vs centros de costo
  // (FinanceDteLine.accountId) de las facturas. Si el usuario no elige
  // cuenta, no se puede conciliar con falta.
  const [diffAccountPlanId, setDiffAccountPlanId] = useState<string>("");
  const [diffProrate, setDiffProrate] = useState(true);
  const [diffLabel, setDiffLabel] = useState("");

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
      setDiffAccountPlanId("");
      setDiffProrate(true);
      setDiffLabel("");
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
          (d: Record<string, unknown>) => {
            const inst = d.installation as
              | { id: string; name: string; commune: string | null }
              | null
              | undefined;
            return {
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
              installationName: inst?.name ?? null,
              installationCommune: inst?.commune ?? null,
            };
          }
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
   * Rebalancea los DTEs no-editados manualmente con water-filling iterativo.
   * Los DTE editados manualmente conservan su monto. El resto se reparte
   * proporcional al `amountPending` de cada uno, redistribuyendo el
   * excedente cuando alguna factura toca su cap.
   */
  const rebalance = (list: DteAllocation[]): DteAllocation[] => {
    if (list.length === 0) return list;
    const caps = list.map((a) => a.dte.amountPending);
    const fixed = list.map((a) =>
      a.manuallyEdited ? parseCLPInput(a.amountInput) ?? 0 : null
    );
    // El total a repartir es el monto bancario completo; si la suma de
    // caps disponibles es menor, water-fill saturará caps y dejará un
    // remaining que el usuario podrá asignar a la cuenta contable.
    const pieces = waterFill(totalAlloc, caps, fixed);
    return list.map((a, i) => {
      if (a.manuallyEdited) return a;
      return { ...a, amountInput: formatCLPInput(String(pieces[i])) };
    });
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
  const hasDifference = delta > 1;
  const hasOverflow = delta < -1;
  const overflowing = selected.some((a) => {
    const v = parseCLPInput(a.amountInput) ?? 0;
    return v > a.dte.amountPending + 0.01;
  });
  const diffCovered = hasDifference && diffAccountPlanId !== "";
  const canConfirm =
    !isMixed &&
    selected.length > 0 &&
    !overflowing &&
    !hasOverflow &&
    (isBalanced || diffCovered) &&
    !confirming &&
    transactions.length > 0;

  // Filtramos las cuentas contables del plan según signo del movimiento:
  // ingresos absorben en cuentas REVENUE / LIABILITY, egresos en EXPENSE/COST.
  // Sin tipo seteado, se muestran todas (defensa por si el seed legacy no
  // tiene `type`).
  const eligibleAccounts = useMemo(() => {
    if (!accountPlans.length) return [];
    return accountPlans.filter((ap) => {
      if (!ap.type) return true;
      if (isIncome) return ["REVENUE", "LIABILITY", "INCOME"].includes(ap.type);
      return ["EXPENSE", "COST"].includes(ap.type);
    });
  }, [accountPlans, isIncome]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      const allocations = selected.map((a) => ({
        dteId: a.dte.id,
        amount: parseCLPInput(a.amountInput) ?? 0,
      }));
      const body: Record<string, unknown> = {
        bankTransactionIds: transactions.map((t) => t.id),
        allocations,
      };
      if (hasDifference && diffCovered) {
        body.differenceAllocation = {
          accountPlanId: diffAccountPlanId,
          amount: Math.round(delta),
          label: diffLabel.trim() || null,
          prorateAcrossDteLines: diffProrate,
        };
      }
      const res = await fetch(
        "/api/finance/banking/transactions/bulk-reconcile-dtes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            // Mobile: bottom sheet
            "fixed inset-x-0 bottom-0 z-50 flex w-full flex-col border-t border-border bg-card shadow-xl duration-300 rounded-t-2xl max-h-[92vh] overscroll-contain",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            // Desktop: centered modal, ancho y con scroll interno (header + footer sticky).
            "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:max-h-[88vh] sm:w-[min(100vw-3rem,56rem)]",
            "opai-ios-surface-dialog",
          )}
        >
          {/* Mobile swipe handle */}
          <div
            aria-hidden
            className="sm:hidden absolute left-1/2 top-2 -translate-x-1/2 h-1 w-9 rounded-full bg-muted-foreground/30"
          />

          {/* Header sticky */}
          <div className="flex-shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-6">
            <DialogPrimitive.Title className="text-base sm:text-lg font-semibold leading-tight tracking-tight text-foreground">
              Conciliar {transactions.length} mov.{" "}
              {selected.length > 0
                ? `contra ${selected.length} factura${selected.length === 1 ? "" : "s"}`
                : "contra facturas"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs sm:text-sm text-muted-foreground mt-1">
              Seleccioná una o más facturas y ajustá el monto a asignar a cada
              una. Útil para cobros parciales o depósitos de factoring que
              cubren múltiples cesiones.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>

          {/* Body scrolleable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-4">
            {isMixed ? (
              <div className="rounded-lg border border-status-danger-border bg-status-danger-soft/30 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-status-danger-fg mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-status-danger-fg">
                    Selección mezclada
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No se pueden conciliar juntos ingresos y egresos. Filtrá
                    por tipo en la lista de movimientos y reintentá.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Resumen del lote */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate">
                      {transactions.length} movimientos ·{" "}
                      {isIncome ? "Ingresos" : "Egresos"}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-semibold tabular-nums shrink-0",
                        isIncome ? "text-status-ok-fg" : "text-status-danger-fg",
                      )}
                    >
                      {fmtCLP.format(isIncome ? totalAlloc : -totalAlloc)}
                    </span>
                  </div>
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5 pr-1">
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
                        <span className="font-mono tabular-nums shrink-0">
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
                              "rounded-lg border p-2.5 flex flex-col sm:flex-row sm:items-center gap-2",
                              over
                                ? "border-status-danger-border bg-status-danger-soft/20"
                                : "border-border",
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
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {counterparty ?? "—"}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                                {a.dte.installationName && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {a.dte.installationName}
                                    {a.dte.installationCommune
                                      ? ` · ${a.dte.installationCommune}`
                                      : ""}
                                  </span>
                                )}
                                <span>
                                  Pendiente{" "}
                                  <span className="font-mono tabular-nums">
                                    {fmtCLP.format(a.dte.amountPending)}
                                  </span>
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                              <Input
                                value={a.amountInput}
                                onChange={(e) =>
                                  updateAmount(a.dte.id, e.target.value)
                                }
                                className="h-10 sm:h-9 w-36 sm:w-40 text-right font-mono tabular-nums text-sm"
                                placeholder="0"
                                inputMode="numeric"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSelect(a.dte)}
                                className="h-10 sm:h-9 px-2"
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
                        "rounded-lg border p-3 text-sm space-y-2",
                        isBalanced && !overflowing
                          ? "border-status-ok-border bg-status-ok-soft/30"
                          : hasOverflow || overflowing
                            ? "border-status-danger-border bg-status-danger-soft/20"
                            : "border-status-warn-border bg-status-warn-soft/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          Asignado a facturas:
                        </span>
                        <span className="font-mono tabular-nums">
                          {fmtCLP.format(totalAssigned)} de{" "}
                          {fmtCLP.format(totalAlloc)}
                        </span>
                      </div>
                      {hasDifference && (
                        <p className="text-status-warn-fg text-xs">
                          Falta asignar {fmtCLP.format(delta)} — elegí abajo
                          una cuenta contable que absorba la diferencia.
                        </p>
                      )}
                      {hasOverflow && (
                        <p className="text-status-danger-fg text-xs">
                          Excede en {fmtCLP.format(-delta)} — bajá uno de los
                          montos.
                        </p>
                      )}
                      {overflowing && !hasOverflow && (
                        <p className="text-status-danger-fg text-xs">
                          Una asignación supera el saldo pendiente de su
                          factura. Ajustala.
                        </p>
                      )}
                    </div>

                    {/* Diferencia → cuenta contable */}
                    {hasDifference && (
                      <div className="rounded-lg border border-status-warn-border bg-status-warn-soft/10 p-3 space-y-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor="diff-account"
                            className="text-sm font-medium"
                          >
                            Asignar diferencia ({fmtCLP.format(delta)}) a
                            cuenta contable
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Típico: comisión de factoring, descuento por
                            pronto pago, retenciones. El asiento contable se
                            genera automáticamente con esa cuenta.
                          </p>
                        </div>
                        <AccountPlanCombobox
                          items={eligibleAccounts}
                          value={diffAccountPlanId}
                          onChange={setDiffAccountPlanId}
                          placeholder={
                            isIncome
                              ? "Buscar cuenta de ingreso / comisión…"
                              : "Buscar cuenta de gasto…"
                          }
                          emptyLabel="Seleccionar cuenta"
                          triggerClassName="w-full"
                        />
                        <Input
                          value={diffLabel}
                          onChange={(e) => setDiffLabel(e.target.value)}
                          placeholder="Nota del asiento (ej. 'Comisión SCF Servicios Financieros')"
                          className="h-10 sm:h-9 text-sm"
                        />
                        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={diffProrate}
                            onCheckedChange={(c) =>
                              setDiffProrate(c === true)
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium text-foreground">
                              Prorratear entre centros de costo de las
                              facturas
                            </span>
                            <br />
                            La diferencia se reparte usando los{" "}
                            <code className="text-[10px]">accountId</code> de
                            cada línea de las facturas seleccionadas,
                            ponderado por el subtotal de la línea y el monto
                            asignado a la factura. Si una factura no tiene{" "}
                            <code className="text-[10px]">accountId</code> en
                            sus líneas, su porción cae en la cuenta elegida
                            arriba sin sub-detalle.
                          </span>
                        </label>
                      </div>
                    )}
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
                          ? "Buscar por folio, cliente, instalación o RUT…"
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
                        : "Buscá por folio, RUT, cliente o instalación para ver candidatos."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {candidates.map((c) => {
                        const isSelected = selected.some(
                          (a) => a.dte.id === c.id,
                        );
                        const counterparty = isIncome
                          ? c.receiverName
                          : c.issuerName;
                        const deltaC = Math.abs(c.amountPending - totalAlloc);
                        const isExactMatch = deltaC <= 1;
                        const isNearMatch =
                          !isExactMatch && deltaC <= totalAlloc * 0.02;
                        // Filtro client-side adicional para que el usuario
                        // pueda escribir el nombre de la instalación aunque
                        // el endpoint sólo busca por cliente/folio/RUT.
                        const localNeedle = debouncedSearch
                          .trim()
                          .toLowerCase();
                        const matchesLocal =
                          !localNeedle ||
                          (c.installationName ?? "")
                            .toLowerCase()
                            .includes(localNeedle) ||
                          (counterparty ?? "")
                            .toLowerCase()
                            .includes(localNeedle) ||
                          String(c.folio).includes(localNeedle);
                        if (!matchesLocal && debouncedSearch.length >= 2)
                          return null;
                        return (
                          <li
                            key={c.id}
                            className={cn(
                              "flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                              isSelected && "bg-primary/5",
                              isExactMatch && !isSelected && "bg-status-ok-soft/30",
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
                              <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {counterparty ?? "—"}
                              </p>
                              {c.installationName && (
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3 shrink-0 text-status-info-fg" />
                                  {c.installationName}
                                  {c.installationCommune
                                    ? ` · ${c.installationCommune}`
                                    : ""}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-1.5 gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(c.date), "dd MMM yyyy", {
                                    locale: es,
                                  })}
                                </span>
                                <div className="text-right shrink-0">
                                  <p className="font-mono tabular-nums text-sm font-medium">
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
          </div>

          {/* Footer sticky */}
          <div className="flex-shrink-0 border-t border-border bg-card px-5 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={confirming}
              className="h-10 sm:h-9"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="h-10 sm:h-9"
            >
              {confirming && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {hasDifference && diffCovered
                ? `Conciliar (${fmtCLP.format(totalAssigned)} + diferencia)`
                : "Conciliar"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
