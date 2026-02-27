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
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/opai";
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface BankAccountOption {
  id: string;
  bankName: string;
  accountNumber: string;
}

interface SupplierOption {
  id: string;
  rut: string;
  name: string;
}

interface Props {
  bankAccounts: BankAccountOption[];
  suppliers: SupplierOption[];
  canManage: boolean;
}

interface PaymentRow {
  id: string;
  code: string;
  type: string;
  date: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  bankAccount: { id: string; bankName: string; accountNumber: string } | null;
  supplier: { id: string; name: string; rut: string } | null;
  _count?: { allocations: number };
}

interface UnpaidDte {
  id: string;
  folio: number;
  dteType: number;
  date: string;
  totalAmount: number;
  amountPending: number;
}

/* ── Constants ── */

const TABS = [
  { id: "list", label: "Pagos Registrados", icon: Banknote },
  { id: "new", label: "Nuevo Pago", icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CASH: "Efectivo",
  CREDIT_CARD: "Tarjeta de credito",
  FACTORING: "Factoring",
  COMPENSATION: "Compensacion",
  OTHER: "Otro",
};

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  COLLECTION: {
    label: "Cobro",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  DISBURSEMENT: {
    label: "Pago",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: "Pendiente",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  CONFIRMED: {
    label: "Confirmado",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  CANCELLED: {
    label: "Cancelado",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const EMPTY_FORM = {
  type: "DISBURSEMENT",
  date: "",
  amount: "",
  paymentMethod: "TRANSFER",
  bankAccountId: "",
  supplierId: "",
  checkNumber: "",
  transferReference: "",
  notes: "",
};

/* ── Component ── */

export function PagosProveedoresClient({
  bankAccounts,
  suppliers,
  canManage,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("list");

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {activeTab === "list" && <PaymentsListTab canManage={canManage} />}
      {activeTab === "new" && (
        <NewPaymentTab
          bankAccounts={bankAccounts}
          suppliers={suppliers}
          canManage={canManage}
          onCreated={() => setActiveTab("list")}
        />
      )}
    </div>
  );
}

/* ===============================================
   Tab 1: Pagos Registrados
   =============================================== */

function PaymentsListTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/banking/payments");
      if (!res.ok) throw new Error("Error al cargar pagos");
      const json = await res.json();
      setPayments(json.data ?? []);
    } catch {
      toast.error("Error al cargar pagos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const filtered = useMemo(() => {
    let list = payments;
    if (typeFilter !== "ALL") list = list.filter((p) => p.type === typeFilter);
    if (dateFrom) {
      list = list.filter((p) => p.date >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((p) => p.date <= dateTo);
    }
    return list;
  }, [payments, typeFilter, dateFrom, dateTo]);

  const handleConfirm = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/finance/banking/payments/${id}/confirm`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al confirmar pago");
      }
      toast.success("Pago confirmado");
      await loadPayments();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error inesperado"
      );
    } finally {
      setActing(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("¿Cancelar este pago? Esta accion no se puede deshacer."))
      return;
    setActing(id);
    try {
      const res = await fetch(`/api/finance/banking/payments/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al cancelar pago");
      }
      toast.success("Pago cancelado");
      await loadPayments();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error inesperado"
      );
    } finally {
      setActing(null);
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
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            <SelectItem value="COLLECTION">Cobro</SelectItem>
            <SelectItem value="DISBURSEMENT">Pago</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-38"
            placeholder="Desde"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-38"
            placeholder="Hasta"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} pago(s)
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-10 w-10" />}
          title="Sin pagos"
          description={
            typeFilter !== "ALL" || dateFrom || dateTo
              ? "No se encontraron pagos con los filtros seleccionados."
              : "No hay pagos registrados aun."
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
                        Codigo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Tipo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Monto
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Metodo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Proveedor
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                        Asignaciones
                      </th>
                      {canManage && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const typeCfg = TYPE_CONFIG[p.type] ?? {
                        label: p.type,
                        className: "bg-muted",
                      };
                      const stCfg = STATUS_CONFIG[p.status] ?? {
                        label: p.status,
                        className: "bg-muted",
                      };
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {p.code}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={cn("text-xs", typeCfg.className)}
                            >
                              {typeCfg.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {format(new Date(p.date), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                            {fmtCLP.format(p.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">
                              {PAYMENT_METHOD_LABELS[p.paymentMethod] ??
                                p.paymentMethod}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {p.supplier ? (
                              <div>
                                <div className="text-sm">
                                  {p.supplier.name}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {p.supplier.rut}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
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
                            {p._count?.allocations ?? 0}
                          </td>
                          {canManage && (
                            <td className="px-3 py-2">
                              {p.status === "PENDING" && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleConfirm(p.id)}
                                    disabled={acting === p.id}
                                    title="Confirmar"
                                  >
                                    {acting === p.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCancel(p.id)}
                                    disabled={acting === p.id}
                                    title="Cancelar"
                                  >
                                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
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
            {filtered.map((p) => {
              const typeCfg = TYPE_CONFIG[p.type] ?? {
                label: p.type,
                className: "bg-muted",
              };
              const stCfg = STATUS_CONFIG[p.status] ?? {
                label: p.status,
                className: "bg-muted",
              };
              return (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs">{p.code}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", typeCfg.className)}
                          >
                            {typeCfg.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", stCfg.className)}
                          >
                            {stCfg.label}
                          </Badge>
                        </div>
                        {p.supplier && (
                          <p className="text-sm font-medium">
                            {p.supplier.name}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">
                            {fmtCLP.format(p.amount)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(p.date), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                          <span>
                            {PAYMENT_METHOD_LABELS[p.paymentMethod] ??
                              p.paymentMethod}
                          </span>
                          <span>
                            {p._count?.allocations ?? 0} asignacion(es)
                          </span>
                        </div>
                      </div>
                    </div>
                    {canManage && p.status === "PENDING" && (
                      <div className="flex gap-1 mt-3 pt-3 border-t border-border">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConfirm(p.id)}
                          disabled={acting === p.id}
                        >
                          {acting === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                          )}
                          Confirmar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(p.id)}
                          disabled={acting === p.id}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ===============================================
   Tab 2: Nuevo Pago
   =============================================== */

function NewPaymentTab({
  bankAccounts,
  suppliers,
  canManage,
  onCreated,
}: {
  bankAccounts: BankAccountOption[];
  suppliers: SupplierOption[];
  canManage: boolean;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Unpaid DTEs for allocation
  const [unpaidDtes, setUnpaidDtes] = useState<UnpaidDte[]>([]);
  const [loadingDtes, setLoadingDtes] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const setField = useCallback(
    (key: string, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  // Load unpaid DTEs when supplier changes
  useEffect(() => {
    if (!form.supplierId) {
      setUnpaidDtes([]);
      setAllocations({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDtes(true);
      try {
        const res = await fetch(
          `/api/finance/billing/received?supplierId=${form.supplierId}`
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) {
          const dtes = Array.isArray(json.data) ? json.data : json.data?.dtes ?? [];
          setUnpaidDtes(dtes);
          setAllocations({});
        }
      } catch {
        if (!cancelled) toast.error("Error al cargar documentos del proveedor");
      } finally {
        if (!cancelled) setLoadingDtes(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [form.supplierId]);

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0),
    [allocations]
  );

  const handleAllocation = (dteId: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setAllocations((prev) => {
      if (clamped === 0) {
        const next = { ...prev };
        delete next[dteId];
        return next;
      }
      return { ...prev, [dteId]: clamped };
    });
  };

  const handleSubmit = async () => {
    if (!form.date || !form.amount) {
      toast.error("Fecha y monto son obligatorios");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }

    setSaving(true);
    try {
      const allocationList = Object.entries(allocations)
        .filter(([, v]) => v > 0)
        .map(([receivedDteId, allocatedAmount]) => ({
          receivedDteId,
          amount: allocatedAmount,
        }));

      const payload: Record<string, unknown> = {
        type: form.type,
        date: form.date,
        amount,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.bankAccountId || null,
        supplierId: form.supplierId || null,
        checkNumber: form.checkNumber.trim() || null,
        transferReference: form.transferReference.trim() || null,
        notes: form.notes.trim() || null,
        allocations: allocationList.length > 0 ? allocationList : undefined,
      };

      const res = await fetch("/api/finance/banking/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear pago");
      }
      toast.success("Pago registrado exitosamente");
      setForm(EMPTY_FORM);
      setAllocations({});
      setUnpaidDtes([]);
      router.refresh();
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error inesperado"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={<Banknote className="h-10 w-10" />}
        title="Sin permisos"
        description="No tienes permisos para registrar pagos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-4">Datos del pago</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Type */}
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setField("type", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COLLECTION">Cobro</SelectItem>
                  <SelectItem value="DISBURSEMENT">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Fecha *</Label>
              <Input
                id="pay-date"
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="h-9"
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Monto (CLP) *</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                className="h-9"
                placeholder="0"
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label>Metodo de pago *</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) => setField("paymentMethod", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bank Account */}
            <div className="space-y-1.5">
              <Label>Cuenta bancaria</Label>
              <SearchableSelect
                value={form.bankAccountId}
                options={bankAccounts.map((ba) => ({
                  id: ba.id,
                  label: `${ba.bankName} - ${ba.accountNumber}`,
                }))}
                placeholder="Seleccionar..."
                emptyText="No se encontraron cuentas bancarias"
                onChange={(v) => setField("bankAccountId", v)}
              />
            </div>

            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <SearchableSelect
                value={form.supplierId}
                options={suppliers.map((s) => ({
                  id: s.id,
                  label: s.name,
                  description: s.rut,
                }))}
                placeholder="Seleccionar..."
                emptyText="No se encontraron proveedores"
                onChange={(v) => setField("supplierId", v)}
              />
            </div>

            {/* Check Number (conditional) */}
            {form.paymentMethod === "CHECK" && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-check">Numero de cheque</Label>
                <Input
                  id="pay-check"
                  value={form.checkNumber}
                  onChange={(e) => setField("checkNumber", e.target.value)}
                  className="h-9"
                  placeholder="Ej: 00012345"
                />
              </div>
            )}

            {/* Transfer Reference (conditional) */}
            {form.paymentMethod === "TRANSFER" && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">Referencia transferencia</Label>
                <Input
                  id="pay-ref"
                  value={form.transferReference}
                  onChange={(e) =>
                    setField("transferReference", e.target.value)
                  }
                  className="h-9"
                  placeholder="Ej: 987654321"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5 mt-4">
            <Label htmlFor="pay-notes">Notas</Label>
            <Textarea
              id="pay-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={3}
              placeholder="Observaciones adicionales..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Allocation section */}
      {form.supplierId && (
        <Card>
          <CardContent className="p-4 md:p-6">
            <h3 className="text-sm font-semibold mb-4">
              Asignar a documentos
            </h3>

            {loadingDtes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : unpaidDtes.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-10 w-10" />}
                title="Sin documentos pendientes"
                description="Este proveedor no tiene documentos pendientes de pago."
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Folio
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Fecha
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Total
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Pendiente
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Asignar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaidDtes.map((d) => (
                          <tr
                            key={d.id}
                            className="border-b border-border/60 last:border-0"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              #{d.folio}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {format(new Date(d.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {fmtCLP.format(d.totalAmount)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {fmtCLP.format(d.amountPending)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                max={d.amountPending}
                                value={allocations[d.id] ?? ""}
                                onChange={(e) =>
                                  handleAllocation(
                                    d.id,
                                    parseFloat(e.target.value) || 0,
                                    d.amountPending
                                  )
                                }
                                className="h-8 w-28 ml-auto text-right font-mono text-xs"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {unpaidDtes.map((d) => (
                    <div
                      key={d.id}
                      className="border border-border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs">#{d.folio}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(d.date), "dd MMM yyyy", {
                            locale: es,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-mono">
                          {fmtCLP.format(d.totalAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Pendiente:
                        </span>
                        <span className="font-mono">
                          {fmtCLP.format(d.amountPending)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Asignar:</Label>
                        <Input
                          type="number"
                          min={0}
                          max={d.amountPending}
                          value={allocations[d.id] ?? ""}
                          onChange={(e) =>
                            handleAllocation(
                              d.id,
                              parseFloat(e.target.value) || 0,
                              d.amountPending
                            )
                          }
                          className="h-8 w-28 text-right font-mono text-xs"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Allocation totals */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <span className="text-sm font-medium">Total asignado:</span>
                  <span className="font-mono text-sm font-semibold">
                    {fmtCLP.format(totalAllocated)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Registrar pago
        </Button>
      </div>
    </div>
  );
}
