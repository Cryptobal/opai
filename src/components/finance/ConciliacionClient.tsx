"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/opai";
import {
  ArrowLeft,
  Check,
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface BankAccountOption {
  id: string;
  bankName: string;
  accountNumber: string;
}

interface ReconciliationRow {
  id: string;
  periodYear: number;
  periodMonth: number;
  bankBalance: number;
  bookBalance: number;
  difference: number;
  status: string;
  bankAccount: { id: string; bankName: string; accountNumber: string };
  _count: { matches: number };
}

interface ReconciliationDetail extends ReconciliationRow {
  matches: Array<{
    id: string;
    matchType: string;
    bankTransaction: {
      id: string;
      transactionDate: string;
      description: string;
      amount: number;
      reference: string | null;
    };
    paymentRecord: {
      id: string;
      code: string;
      amount: number;
      date: string;
    } | null;
    journalEntry: {
      id: string;
      number: number;
      description: string;
    } | null;
  }>;
  unmatchedTransactions: Array<{
    id: string;
    transactionDate: string;
    description: string;
    reference: string | null;
    amount: number;
    balance: number | null;
  }>;
}

interface Props {
  bankAccounts: BankAccountOption[];
  canManage: boolean;
}

/* ── Constants ── */

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  IN_PROGRESS: {
    label: "En progreso",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  COMPLETED: {
    label: "Completada",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const EMPTY_CREATE_FORM = {
  bankAccountId: "",
  periodYear: String(new Date().getFullYear()),
  periodMonth: String(new Date().getMonth() + 1),
  bankBalance: "",
  bookBalance: "",
};

/* ── Component ── */

export function ConciliacionClient({ bankAccounts, canManage }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <DetailView
        reconciliationId={selectedId}
        canManage={canManage}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <ListView
      bankAccounts={bankAccounts}
      canManage={canManage}
      onSelect={setSelectedId}
    />
  );
}

/* ═══════════════════════════════════════════════
   List View
   ═══════════════════════════════════════════════ */

function ListView({
  bankAccounts,
  canManage,
  onSelect,
}: {
  bankAccounts: BankAccountOption[];
  canManage: boolean;
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankFilter, setBankFilter] = useState("ALL");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const url = new URL("/api/finance/banking/reconciliation", window.location.origin);
      if (bankFilter !== "ALL") url.searchParams.set("bankAccountId", bankFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      toast.error("Error al cargar conciliaciones");
    } finally {
      setLoading(false);
    }
  }, [bankFilter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => rows, [rows]);

  const setField = useCallback(
    (key: string, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const openCreate = useCallback(() => {
    setForm(EMPTY_CREATE_FORM);
    setDialogOpen(true);
  }, []);

  const handleCreate = async () => {
    if (!form.bankAccountId) {
      toast.error("Seleccione una cuenta bancaria");
      return;
    }
    if (!form.bankBalance || !form.bookBalance) {
      toast.error("Ingrese saldo banco y saldo libro");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/banking/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId: form.bankAccountId,
          periodYear: parseInt(form.periodYear),
          periodMonth: parseInt(form.periodMonth),
          bankBalance: parseFloat(form.bankBalance),
          bookBalance: parseFloat(form.bookBalance),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear conciliación");
      }
      toast.success("Conciliación creada");
      setDialogOpen(false);
      router.refresh();
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="w-full sm:w-52 h-9">
              <SelectValue placeholder="Cuenta bancaria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las cuentas</SelectItem>
              {bankAccounts.map((ba) => (
                <SelectItem key={ba.id} value={ba.id}>
                  {ba.bankName} - {ba.accountNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva conciliación
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} conciliación(es)
      </p>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-10 w-10" />}
          title="Sin conciliaciones"
          description={
            bankFilter !== "ALL"
              ? "No se encontraron conciliaciones para esta cuenta."
              : "No hay conciliaciones bancarias registradas aún."
          }
          action={
            canManage && bankFilter === "ALL" ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Crear conciliación
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Período
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Cuenta bancaria
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Saldo banco
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Saldo libro
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Diferencia
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                        Conciliaciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const stCfg = STATUS_CONFIG[r.status] ?? {
                        label: r.status,
                        className: "bg-muted",
                      };
                      return (
                        <tr
                          key={r.id}
                          onClick={() => onSelect(r.id)}
                          className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                        >
                          <td className="px-3 py-2 font-medium">
                            {MONTH_LABELS[r.periodMonth - 1]} {r.periodYear}
                          </td>
                          <td className="px-3 py-2">
                            <div>{r.bankAccount.bankName}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {r.bankAccount.accountNumber}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {fmtCLP.format(r.bankBalance)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {fmtCLP.format(r.bookBalance)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono text-xs font-medium",
                              r.difference !== 0 && "text-amber-400"
                            )}
                          >
                            {fmtCLP.format(r.difference)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={cn("text-xs", stCfg.className)}
                            >
                              {stCfg.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs">
                            {r._count.matches}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => {
              const stCfg = STATUS_CONFIG[r.status] ?? {
                label: r.status,
                className: "bg-muted",
              };
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(r.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            {MONTH_LABELS[r.periodMonth - 1]} {r.periodYear}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] shrink-0", stCfg.className)}
                          >
                            {stCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {r.bankAccount.bankName} - {r.bankAccount.accountNumber}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Banco</span>
                            <p className="font-mono">
                              {fmtCLP.format(r.bankBalance)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Libro</span>
                            <p className="font-mono">
                              {fmtCLP.format(r.bookBalance)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Dif.</span>
                            <p
                              className={cn(
                                "font-mono",
                                r.difference !== 0 && "text-amber-400"
                              )}
                            >
                              {fmtCLP.format(r.difference)}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {r._count.matches} conciliación(es)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva conciliación bancaria</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Cuenta bancaria *</Label>
              <Select
                value={form.bankAccountId}
                onValueChange={(v) => setField("bankAccountId", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((ba) => (
                    <SelectItem key={ba.id} value={ba.id}>
                      {ba.bankName} - {ba.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="conc-year">Año *</Label>
                <Input
                  id="conc-year"
                  type="number"
                  min={2020}
                  max={2099}
                  value={form.periodYear}
                  onChange={(e) => setField("periodYear", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mes *</Label>
                <Select
                  value={form.periodMonth}
                  onValueChange={(v) => setField("periodMonth", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_LABELS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="conc-bank-bal">Saldo banco *</Label>
                <Input
                  id="conc-bank-bal"
                  type="number"
                  placeholder="0"
                  value={form.bankBalance}
                  onChange={(e) => setField("bankBalance", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conc-book-bal">Saldo libro *</Label>
                <Input
                  id="conc-book-bal"
                  type="number"
                  placeholder="0"
                  value={form.bookBalance}
                  onChange={(e) => setField("bookBalance", e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Crear conciliación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Detail View
   ═══════════════════════════════════════════════ */

function DetailView({
  reconciliationId,
  canManage,
  onBack,
}: {
  reconciliationId: string;
  canManage: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Match form state
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");
  const [matchJournalId, setMatchJournalId] = useState("");
  const [matching, setMatching] = useState(false);
  const [completing, setCompleting] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/finance/banking/reconciliation/${reconciliationId}`
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setDetail(json.data ?? json);
    } catch {
      toast.error("Error al cargar detalle de conciliación");
    } finally {
      setLoading(false);
    }
  }, [reconciliationId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleMatch = async () => {
    if (!selectedTxId) {
      toast.error("Seleccione un movimiento bancario");
      return;
    }
    if (!matchPaymentId && !matchJournalId) {
      toast.error("Ingrese un ID de pago o asiento contable");
      return;
    }
    setMatching(true);
    try {
      const body: Record<string, string> = {
        bankTransactionId: selectedTxId,
      };
      if (matchPaymentId) body.paymentRecordId = matchPaymentId;
      if (matchJournalId) body.journalEntryId = matchJournalId;

      const res = await fetch(
        `/api/finance/banking/reconciliation/${reconciliationId}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al conciliar");
      }
      toast.success("Movimiento conciliado");
      setSelectedTxId(null);
      setMatchPaymentId("");
      setMatchJournalId("");
      router.refresh();
      loadDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setMatching(false);
    }
  };

  const handleComplete = async () => {
    if (
      !confirm(
        "¿Completar esta conciliación? No podrá agregar más conciliaciones después."
      )
    )
      return;
    setCompleting(true);
    try {
      const res = await fetch(
        `/api/finance/banking/reconciliation/${reconciliationId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete" }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al completar conciliación");
      }
      toast.success("Conciliación completada");
      router.refresh();
      loadDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Volver
        </Button>
        <EmptyState
          icon={<Landmark className="h-10 w-10" />}
          title="No encontrada"
          description="No se pudo cargar la conciliación."
        />
      </div>
    );
  }

  const stCfg = STATUS_CONFIG[detail.status] ?? {
    label: detail.status,
    className: "bg-muted",
  };
  const isCompleted = detail.status === "COMPLETED";
  const selectedTx = detail.unmatchedTransactions.find(
    (t) => t.id === selectedTxId
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Volver
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">
                  {MONTH_LABELS[detail.periodMonth - 1]} {detail.periodYear}
                </h3>
                <Badge
                  variant="outline"
                  className={cn("text-xs", stCfg.className)}
                >
                  {stCfg.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.bankAccount.bankName} -{" "}
                {detail.bankAccount.accountNumber}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <span className="text-muted-foreground text-xs block">
                  Saldo banco
                </span>
                <span className="font-mono font-medium">
                  {fmtCLP.format(detail.bankBalance)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-xs block">
                  Saldo libro
                </span>
                <span className="font-mono font-medium">
                  {fmtCLP.format(detail.bookBalance)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-xs block">
                  Diferencia
                </span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    detail.difference !== 0 && "text-amber-400"
                  )}
                >
                  {fmtCLP.format(detail.difference)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main content: unmatched + match form */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Unmatched bank transactions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">
            Movimientos bancarios sin conciliar
            <span className="text-muted-foreground font-normal ml-1">
              ({detail.unmatchedTransactions.length})
            </span>
          </h4>

          {detail.unmatchedTransactions.length === 0 ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Todos los movimientos han sido conciliados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {detail.unmatchedTransactions.map((tx) => (
                <Card
                  key={tx.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedTxId === tx.id
                      ? "border-primary ring-1 ring-primary/30"
                      : "hover:bg-accent/30",
                    isCompleted && "cursor-default"
                  )}
                  onClick={() => {
                    if (!isCompleted) {
                      setSelectedTxId(
                        selectedTxId === tx.id ? null : tx.id
                      );
                    }
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {tx.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>
                            {format(
                              new Date(tx.transactionDate),
                              "dd MMM yyyy",
                              { locale: es }
                            )}
                          </span>
                          {tx.reference && (
                            <span className="font-mono">
                              Ref: {tx.reference}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-sm font-medium shrink-0",
                          tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {fmtCLP.format(tx.amount)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Match form */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Conciliar</h4>

          {!canManage || isCompleted ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground text-center py-4">
                  {isCompleted
                    ? "Esta conciliación ya fue completada."
                    : "No tiene permisos para conciliar."}
                </p>
              </CardContent>
            </Card>
          ) : selectedTx ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="rounded-md bg-accent/30 p-3 text-sm">
                  <p className="font-medium">{selectedTx.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(
                      new Date(selectedTx.transactionDate),
                      "dd MMM yyyy",
                      { locale: es }
                    )}{" "}
                    &middot; {fmtCLP.format(selectedTx.amount)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="match-payment">
                    ID Registro de pago (opcional)
                  </Label>
                  <Input
                    id="match-payment"
                    placeholder="ID del pago..."
                    value={matchPaymentId}
                    onChange={(e) => setMatchPaymentId(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="match-journal">
                    ID Asiento contable (opcional)
                  </Label>
                  <Input
                    id="match-journal"
                    placeholder="ID del asiento..."
                    value={matchJournalId}
                    onChange={(e) => setMatchJournalId(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleMatch}
                  disabled={matching}
                >
                  {matching ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-1.5" />
                  )}
                  Conciliar movimiento
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Seleccione un movimiento bancario para conciliar.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Complete button */}
          {canManage && !isCompleted && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Completar conciliación
            </Button>
          )}
        </div>
      </div>

      {/* Already matched */}
      {detail.matches.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">
            Movimientos conciliados
            <span className="text-muted-foreground font-normal ml-1">
              ({detail.matches.length})
            </span>
          </h4>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Descripción
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Monto
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Referencia
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Tipo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Registro asociado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.matches.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-3 py-2 text-xs">
                          {format(
                            new Date(m.bankTransaction.transactionDate),
                            "dd MMM yyyy",
                            { locale: es }
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {m.bankTransaction.description}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtCLP.format(m.bankTransaction.amount)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                          {m.bankTransaction.reference ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Badge variant="outline" className="text-xs">
                            {m.matchType}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.paymentRecord && (
                            <span>
                              Pago {m.paymentRecord.code} -{" "}
                              {fmtCLP.format(m.paymentRecord.amount)}
                            </span>
                          )}
                          {m.journalEntry && (
                            <span>
                              Asiento #{m.journalEntry.number} -{" "}
                              {m.journalEntry.description}
                            </span>
                          )}
                          {!m.paymentRecord && !m.journalEntry && "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {detail.matches.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {m.bankTransaction.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>
                          {format(
                            new Date(m.bankTransaction.transactionDate),
                            "dd MMM yyyy",
                            { locale: es }
                          )}
                        </span>
                        {m.bankTransaction.reference && (
                          <span className="font-mono">
                            Ref: {m.bankTransaction.reference}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {m.matchType}
                        </Badge>
                        {m.paymentRecord && (
                          <span className="text-xs text-muted-foreground">
                            Pago {m.paymentRecord.code}
                          </span>
                        )}
                        {m.journalEntry && (
                          <span className="text-xs text-muted-foreground">
                            Asiento #{m.journalEntry.number}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-medium shrink-0">
                      {fmtCLP.format(m.bankTransaction.amount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
