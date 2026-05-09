"use client";

/**
 * Drawer de conciliación manual de un movimiento bancario.
 *
 * Estructura: Sheet lateral con dos tabs:
 *   1. "Comparar transacciones" — lista de DTEs candidatos sugeridos
 *      (por monto + fecha). El usuario selecciona uno o varios; abajo se
 *      muestra el resumen con la diferencia respecto al monto del mov.
 *      Si queda resto, se prompt para asignarlo a una cuenta contable
 *      (split). Botón "Coincidir" guarda como links.
 *   2. "Categorizar de forma manual" — categorización rápida sin entidad:
 *      cuenta contable + nota. Útil para comisiones, intereses, gastos
 *      que no están en DTE.
 *
 * Soporta split N:N porque usa el endpoint de links que reemplaza atómico.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Trash2,
  Layers,
  Receipt,
  Search,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──

interface Tx {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface Candidate {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  documentType: string;
  folio: number | null;
  issuerName: string;
  receiverName: string;
  receiverRut: string | null;
  issuerRut: string | null;
  total: number;
  amountPaid: number;
  amountPending: number;
  issuedAt: string;
  paymentStatus: string;
}

type LocalLinkType =
  | "DTE_ISSUED"
  | "DTE_RECEIVED"
  | "EXPENSE"
  | "INCOME";

interface LocalLink {
  /** Identificador local para el render. Si es DTE, es el id del DTE. */
  key: string;
  targetType: LocalLinkType;
  targetId: string | null;
  amount: number;
  accountPlanId: string | null;
  note: string | null;
  /** Etiqueta para mostrar (ej. "Factura 1234 - Cliente X"). */
  label: string;
}

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
  /** Tipo contable. */
  type?: string;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Gastos",
  COST: "Costos",
  REVENUE: "Ingresos",
  ASSET: "Activos",
  LIABILITY: "Pasivos",
  EQUITY: "Patrimonio",
};

/**
 * Para egresos priorizamos gastos/costos arriba; para ingresos los ingresos.
 * El resto se ordena alfabéticamente.
 */
function groupAccounts(
  plans: AccountPlanOption[],
  amountSign: "income" | "expense"
): { type: string; label: string; items: AccountPlanOption[] }[] {
  const buckets = new Map<string, AccountPlanOption[]>();
  for (const p of plans) {
    const t = p.type ?? "OTHER";
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(p);
  }
  const order: string[] =
    amountSign === "income"
      ? ["REVENUE", "ASSET", "LIABILITY", "EQUITY", "COST", "EXPENSE", "OTHER"]
      : ["EXPENSE", "COST", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "OTHER"];
  return order
    .filter((t) => buckets.has(t))
    .map((t) => ({
      type: t,
      label: ACCOUNT_TYPE_LABEL[t] ?? "Otros",
      items: buckets
        .get(t)!
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
}

interface BankTxReconcileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: Tx | null;
  accountPlans: AccountPlanOption[];
  onSaved: () => void;
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function BankTxReconcileSheet({
  open,
  onOpenChange,
  tx,
  accountPlans,
  onSaved,
}: BankTxReconcileSheetProps) {
  const [tab, setTab] = useState<"compare" | "manual">("compare");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Filtros del tab "Comparar transacciones" (estilo Zoho)
  const [filterText, setFilterText] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDirection, setFilterDirection] = useState<"all" | "ISSUED" | "RECEIVED">("all");
  const [links, setLinks] = useState<LocalLink[]>([]);
  const [saving, setSaving] = useState(false);
  // Form de "categorizar manual"
  const [manualAccountType, setManualAccountType] = useState<string>("");
  const [manualAccountId, setManualAccountId] = useState<string>("");
  const [manualAmount, setManualAmount] = useState<string>("");
  const [manualNote, setManualNote] = useState("");
  const [manualDate, setManualDate] = useState<string>("");
  // Cuenta contable de "resto" cuando la suma de DTEs no cubre el total
  const [restAccountType, setRestAccountType] = useState<string>("");
  const [restAccountId, setRestAccountId] = useState<string>("");
  const [restNote, setRestNote] = useState("");

  const txAmountAbs = tx ? Math.abs(tx.amount) : 0;
  const linksTotal = useMemo(
    () => links.reduce((s, l) => s + l.amount, 0),
    [links]
  );
  const remaining = Math.max(0, txAmountAbs - linksTotal);

  const loadCandidates = useCallback(async () => {
    if (!tx) return;
    setLoadingCandidates(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/candidates`
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setCandidates(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoadingCandidates(false);
    }
  }, [tx]);

  useEffect(() => {
    if (open && tx) {
      setTab("compare");
      setLinks([]);
      setManualAccountType("");
      setManualAccountId("");
      setManualAmount(String(Math.abs(tx.amount)));
      setManualNote("");
      setManualDate(tx.transactionDate.slice(0, 10));
      setRestAccountType("");
      setRestAccountId("");
      setRestNote("");
      setFilterText("");
      setFilterMinAmount("");
      setFilterMaxAmount("");
      setFilterDateFrom("");
      setFilterDateTo("");
      setFilterDirection("all");
      setShowFilters(false);
      loadCandidates();
    }
  }, [open, tx, loadCandidates]);

  // Filtrado client-side de los candidatos según los filtros del usuario.
  // El endpoint trae sugerencias por monto cercano + fecha; los filtros
  // permiten al usuario afinar (ej. ver solo emitidos, expandir el rango).
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterDirection !== "all" && c.direction !== filterDirection)
        return false;
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        const txt = [
          c.documentType,
          String(c.folio ?? ""),
          c.issuerName,
          c.receiverName,
          c.issuerRut ?? "",
          c.receiverRut ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!txt.includes(q)) return false;
      }
      if (filterMinAmount) {
        const min = Number(filterMinAmount);
        if (Number.isFinite(min) && c.amountPending < min) return false;
      }
      if (filterMaxAmount) {
        const max = Number(filterMaxAmount);
        if (Number.isFinite(max) && c.amountPending > max) return false;
      }
      if (filterDateFrom) {
        if (c.issuedAt.slice(0, 10) < filterDateFrom) return false;
      }
      if (filterDateTo) {
        if (c.issuedAt.slice(0, 10) > filterDateTo) return false;
      }
      return true;
    });
  }, [
    candidates,
    filterText,
    filterMinAmount,
    filterMaxAmount,
    filterDateFrom,
    filterDateTo,
    filterDirection,
  ]);

  const toggleCandidate = (c: Candidate) => {
    const isLinked = links.some((l) => l.key === c.id);
    if (isLinked) {
      setLinks((prev) => prev.filter((l) => l.key !== c.id));
      return;
    }
    // Monto sugerido: el menor entre el pendiente del DTE y el remaining
    const suggested = Math.min(c.amountPending, remaining || c.amountPending);
    setLinks((prev) => [
      ...prev,
      {
        key: c.id,
        targetType: c.direction === "ISSUED" ? "DTE_ISSUED" : "DTE_RECEIVED",
        targetId: c.id,
        amount: suggested,
        accountPlanId: null,
        note: null,
        label: `${c.documentType} ${c.folio ?? ""} - ${
          c.direction === "ISSUED" ? c.receiverName : c.issuerName
        }`,
      },
    ]);
  };

  const updateLinkAmount = (key: string, amount: number) => {
    setLinks((prev) =>
      prev.map((l) => (l.key === key ? { ...l, amount } : l))
    );
  };

  const removeLink = (key: string) => {
    setLinks((prev) => prev.filter((l) => l.key !== key));
  };

  const handleAddManualLine = () => {
    if (!manualAccountId) {
      toast.error("Seleccioná una cuenta contable");
      return;
    }
    const amt = Number(manualAmount.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!tx) return;
    const isIncome = tx.amount > 0;
    const account = accountPlans.find((a) => a.id === manualAccountId);
    const noteWithDate =
      manualDate && manualDate !== tx.transactionDate.slice(0, 10)
        ? `${manualNote.trim() ? manualNote.trim() + " · " : ""}Fecha: ${manualDate}`
        : manualNote.trim() || null;
    setLinks((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: amt,
        accountPlanId: manualAccountId,
        note: noteWithDate,
        label: `${isIncome ? "Ingreso manual" : "Gasto manual"}: ${account?.code ?? ""} ${account?.name ?? ""}`,
      },
    ]);
    setManualAmount(String(remaining > 0 ? remaining - amt : 0));
    setManualNote("");
    toast.success("Línea agregada");
    setTab("compare"); // volver para ver el resumen
  };

  const handleSave = async () => {
    if (!tx) return;
    if (links.length === 0) {
      toast.error("Agregá al menos un vínculo o categorización");
      return;
    }
    // Si queda diferencia, exigir cuenta contable de resto
    let finalLinks = [...links];
    if (remaining > 0.01) {
      if (!restAccountId) {
        toast.error(
          `Falta asignar $${remaining.toLocaleString("es-CL")}. Seleccioná una cuenta contable para el resto, o categorizá manual.`
        );
        return;
      }
      const isIncome = tx.amount > 0;
      const account = accountPlans.find((a) => a.id === restAccountId);
      finalLinks.push({
        key: "rest",
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: remaining,
        accountPlanId: restAccountId,
        note: restNote.trim() || "Resto sin asignar",
        label: `Resto: ${account?.code ?? ""} ${account?.name ?? ""}`,
      });
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/links`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            links: finalLinks.map((l) => ({
              targetType: l.targetType,
              targetId: l.targetId,
              amount: l.amount,
              accountPlanId: l.accountPlanId,
              note: l.note,
            })),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Movimiento conciliado");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!tx) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Conciliar movimiento</SheetTitle>
        </SheetHeader>
        {/* Preview de la tx — fuera de SheetDescription para no romper la
            regla de DOM (DialogDescription es <p>; los <div> internos
            disparaban hydration warning). */}
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-foreground font-medium">{tx.description}</span>
            <span
              className={cn(
                "font-mono font-semibold",
                tx.amount >= 0
                  ? "text-status-ok-fg"
                  : "text-status-danger-fg"
              )}
            >
              {fmtCLP.format(tx.amount)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(tx.transactionDate), "dd MMM yyyy", {
              locale: es,
            })}
            {tx.reference && (
              <>
                {" · "}
                <span className="font-mono">{tx.reference}</span>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 border-b border-border">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTab("compare")}
              className={cn(
                "px-1 py-2 text-sm font-medium transition-colors border-b-2",
                tab === "compare"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5 inline-block mr-1.5" />
              Comparar transacciones
            </button>
            <button
              type="button"
              onClick={() => setTab("manual")}
              className={cn(
                "px-1 py-2 text-sm font-medium transition-colors border-b-2",
                tab === "manual"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt className="h-3.5 w-3.5 inline-block mr-1.5" />
              Categorizar manual
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === "compare" && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  Coincidencias posibles
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <Filter className="h-3 w-3 mr-1" />
                  {showFilters ? "Ocultar filtros" : "Filtrar"}
                </Button>
              </div>

              {showFilters && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 space-y-2.5">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por contraparte, RUT, folio…"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="h-9 pl-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Monto desde"
                      value={filterMinAmount}
                      onChange={(e) => setFilterMinAmount(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Input
                      type="number"
                      placeholder="Monto hasta"
                      value={filterMaxAmount}
                      onChange={(e) => setFilterMaxAmount(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Select
                    value={filterDirection}
                    onValueChange={(v) =>
                      setFilterDirection(v as "all" | "ISSUED" | "RECEIVED")
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      <SelectItem value="ISSUED">Solo ventas</SelectItem>
                      <SelectItem value="RECEIVED">Solo compras</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {filteredCandidates.length} de {candidates.length} candidatos
                  </p>
                </div>
              )}

              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  {candidates.length === 0
                    ? "No se encontraron facturas candidatas. Probá con “Categorizar manual” o ajustá la fecha."
                    : "Ninguno de los candidatos coincide con tus filtros. Limpiá los filtros para ver todos."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredCandidates.map((c) => {
                    const selected = links.some((l) => l.key === c.id);
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/30"
                        )}
                        onClick={() => toggleCandidate(c)}
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
                              {c.documentType} {c.folio ?? ""}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {c.direction === "ISSUED"
                                ? "Venta"
                                : "Compra"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                c.paymentStatus === "PARTIAL"
                                  ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
                                  : c.paymentStatus === "OVERDUE"
                                    ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
                                    : "bg-muted"
                              )}
                            >
                              {c.paymentStatus}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.direction === "ISSUED"
                              ? c.receiverName
                              : c.issuerName}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(c.issuedAt), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            <div className="text-right">
                              <p className="font-mono text-sm font-medium">
                                {fmtCLP.format(c.amountPending)}
                              </p>
                              {c.amountPending !== c.total && (
                                <p className="text-[11px] text-muted-foreground">
                                  de {fmtCLP.format(c.total)}
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

            {/* Resumen */}
            {links.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  Vínculos seleccionados
                </p>
                <ul className="space-y-1.5">
                  {links.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="flex-1 truncate">{l.label}</span>
                      <Input
                        type="number"
                        className="h-8 w-32 font-mono text-right"
                        value={l.amount}
                        onChange={(e) =>
                          updateLinkAmount(l.key, Number(e.target.value) || 0)
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => removeLink(l.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border pt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Asignado</span>
                    <span className="font-mono font-medium">
                      {fmtCLP.format(linksTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Monto del movimiento
                    </span>
                    <span className="font-mono">
                      {fmtCLP.format(txAmountAbs)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "flex items-center justify-between font-medium",
                      remaining > 0.01
                        ? "text-status-warn-fg"
                        : "text-status-ok-fg"
                    )}
                  >
                    <span>{remaining > 0.01 ? "Falta asignar" : "Cuadrado"}</span>
                    <span className="font-mono">
                      {remaining > 0.01 ? fmtCLP.format(remaining) : "✓"}
                    </span>
                  </div>
                </div>
                {remaining > 0.01 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Asigná el resto a una cuenta contable (ej. costos
                      factoring, comisión, gastos varios):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={restAccountType}
                        onValueChange={(v) => {
                          setRestAccountType(v);
                          setRestAccountId("");
                        }}
                      >
                        <SelectTrigger className="h-10 sm:h-9">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupAccounts(
                            accountPlans,
                            tx && tx.amount > 0 ? "income" : "expense"
                          ).map((g) => (
                            <SelectItem key={g.type} value={g.type}>
                              {g.label}{" "}
                              <span className="text-muted-foreground text-xs">
                                ({g.items.length})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={restAccountId}
                        onValueChange={setRestAccountId}
                        disabled={!restAccountType}
                      >
                        <SelectTrigger className="h-10 sm:h-9">
                          <SelectValue
                            placeholder={
                              restAccountType ? "Cuenta" : "Tipo primero"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(
                            groupAccounts(
                              accountPlans,
                              tx && tx.amount > 0 ? "income" : "expense"
                            ).find((g) => g.type === restAccountType)?.items ?? []
                          ).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.code} {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder="Nota (opcional)"
                      value={restNote}
                      onChange={(e) => setRestNote(e.target.value)}
                      maxLength={300}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "manual" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Categorizá este movimiento sin vincular a una factura. Útil para
              comisiones, intereses, transferencias entre cuentas, etc.
            </p>
            {/* Step 1: tipo contable. Step 2: cuenta filtrada por tipo.
                Esto baja el ruido cuando el plan tiene muchas cuentas. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={manualAccountType}
                  onValueChange={(v) => {
                    setManualAccountType(v);
                    setManualAccountId(""); // reset al cambiar tipo
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupAccounts(
                      accountPlans,
                      tx && tx.amount > 0 ? "income" : "expense"
                    ).map((g) => (
                      <SelectItem key={g.type} value={g.type}>
                        {g.label}{" "}
                        <span className="text-muted-foreground text-xs">
                          ({g.items.length})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cuenta contable *</Label>
                <Select
                  value={manualAccountId}
                  onValueChange={setManualAccountId}
                  disabled={!manualAccountType}
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue
                      placeholder={
                        manualAccountType
                          ? "Seleccionar cuenta"
                          : "Elige el tipo primero"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(
                      groupAccounts(
                        accountPlans,
                        tx && tx.amount > 0 ? "income" : "expense"
                      ).find((g) => g.type === manualAccountType)?.items ?? []
                    ).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="manual-date">Fecha *</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="h-10 sm:h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-amount">Monto *</Label>
                <Input
                  id="manual-amount"
                  type="number"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="font-mono h-10 sm:h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-note">Nota</Label>
              <Input
                id="manual-note"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Ej. Comisión bancaria mensual"
                maxLength={300}
                className="h-10 sm:h-9"
              />
            </div>
            <Button onClick={handleAddManualLine} size="sm">
              Agregar a vínculos
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
          <Button
            onClick={handleSave}
            disabled={saving || links.length === 0}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Coincidir
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
