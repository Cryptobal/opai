"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Landmark,
  ArrowLeftRight,
  Upload,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface BankAccountRow {
  id: string;
  bankCode: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  currency: string;
  holderName: string;
  holderRut: string;
  currentBalance: number;
  isDefault: boolean;
  isActive: boolean;
  accountPlanId: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  accounts: BankAccountRow[];
  accountPlans: AccountOption[];
  canManage: boolean;
}

interface TransactionRow {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  reconciliationStatus: string;
}

/* ── Constants ── */

const TABS = [
  { id: "accounts", label: "Cuentas Bancarias", icon: Landmark },
  { id: "transactions", label: "Movimientos", icon: ArrowLeftRight },
  { id: "import", label: "Importar Cartola", icon: Upload },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  CHECKING: {
    label: "Corriente",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  SAVINGS: {
    label: "Ahorro",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  VISTA: {
    label: "Vista",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
};

const RECONC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNMATCHED: {
    label: "Sin conciliar",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  MATCHED: {
    label: "Conciliado",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  RECONCILED: {
    label: "Reconciliado",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  EXCLUDED: {
    label: "Excluido",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const EMPTY_FORM = {
  bankCode: "",
  bankName: "",
  accountType: "CHECKING",
  accountNumber: "",
  currency: "CLP",
  holderName: "",
  holderRut: "",
  accountPlanId: "",
  isDefault: false,
};

/* ── Component ── */

export function BancosClient({ accounts, accountPlans, canManage }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("accounts");

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

      {activeTab === "accounts" && (
        <AccountsTab
          accounts={accounts}
          accountPlans={accountPlans}
          canManage={canManage}
        />
      )}
      {activeTab === "transactions" && (
        <TransactionsTab accounts={accounts} />
      )}
      {activeTab === "import" && (
        <ImportTab accounts={accounts} canManage={canManage} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 1: Cuentas Bancarias
   ═══════════════════════════════════════════════ */

function AccountsTab({
  accounts,
  accountPlans,
  canManage,
}: {
  accounts: BankAccountRow[];
  accountPlans: AccountOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.bankName.toLowerCase().includes(q) ||
        a.accountNumber.toLowerCase().includes(q) ||
        a.holderName.toLowerCase().includes(q) ||
        a.holderRut.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((a: BankAccountRow) => {
    setEditingId(a.id);
    setForm({
      bankCode: a.bankCode,
      bankName: a.bankName,
      accountType: a.accountType,
      accountNumber: a.accountNumber,
      currency: a.currency,
      holderName: a.holderName,
      holderRut: a.holderRut,
      accountPlanId: a.accountPlanId ?? "",
      isDefault: a.isDefault,
    });
    setDialogOpen(true);
  }, []);

  const setField = useCallback(
    (key: string, value: string | boolean) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const handleSave = async () => {
    if (!form.bankCode.trim() || !form.bankName.trim() || !form.accountNumber.trim()) {
      toast.error("Banco, nombre del banco y N. de cuenta son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        bankCode: form.bankCode.trim(),
        bankName: form.bankName.trim(),
        accountType: form.accountType,
        accountNumber: form.accountNumber.trim(),
        currency: form.currency,
        holderName: form.holderName.trim(),
        holderRut: form.holderRut.trim(),
        accountPlanId: form.accountPlanId || null,
        isDefault: form.isDefault,
      };

      if (editingId) {
        const res = await fetch(`/api/finance/banking/accounts/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al actualizar cuenta");
        }
        toast.success("Cuenta actualizada");
      } else {
        const res = await fetch("/api/finance/banking/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al crear cuenta");
        }
        toast.success("Cuenta creada");
      }
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta bancaria? Esta acción no se puede deshacer."))
      return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/finance/banking/accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar cuenta");
      }
      toast.success("Cuenta eliminada");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar banco, cuenta, titular..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva cuenta
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} cuenta(s)
      </p>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-10 w-10" />}
          title="Sin cuentas bancarias"
          description={
            search
              ? "No se encontraron cuentas con los filtros seleccionados."
              : "No hay cuentas bancarias registradas aún."
          }
          action={
            canManage && !search ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Crear cuenta
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
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Banco</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">N. Cuenta</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Titular</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Moneda</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Saldo</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-center">Estado</th>
                      {canManage && (
                        <th className="px-4 py-3 font-medium text-muted-foreground" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const typeCfg = ACCOUNT_TYPE_LABELS[a.accountType] ?? {
                        label: a.accountType,
                        className: "bg-muted",
                      };
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {a.bankName}
                              {a.isDefault && (
                                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={cn("text-xs", typeCfg.className)}>
                              {typeCfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{a.accountNumber}</td>
                          <td className="px-4 py-3">
                            <div>{a.holderName}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {a.holderRut}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">{a.currency}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                            {fmtCLP.format(a.currentBalance)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                a.isActive
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                              )}
                            >
                              {a.isActive ? "Activa" : "Inactiva"}
                            </Badge>
                          </td>
                          {canManage && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(a)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(a.id)}
                                  disabled={deleting === a.id}
                                >
                                  {deleting === a.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  )}
                                </Button>
                              </div>
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
          <div className="md:hidden space-y-2 min-w-0">
            {filtered.map((a) => {
              const typeCfg = ACCOUNT_TYPE_LABELS[a.accountType] ?? {
                label: a.accountType,
                className: "bg-muted",
              };
              return (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium truncate">{a.bankName}</p>
                          {a.isDefault && (
                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                          )}
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] shrink-0", typeCfg.className)}
                          >
                            {typeCfg.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              a.isActive
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                            )}
                          >
                            {a.isActive ? "Activa" : "Inactiva"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {a.accountNumber}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.holderName} - {a.holderRut}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">
                            {fmtCLP.format(a.currentBalance)}
                          </span>
                          <span className="text-xs text-muted-foreground">{a.currency}</span>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(a.id)}
                            disabled={deleting === a.id}
                          >
                            {deleting === a.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ba-bankCode">Código banco *</Label>
                <Input
                  id="ba-bankCode"
                  placeholder="012"
                  value={form.bankCode}
                  onChange={(e) => setField("bankCode", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-bankName">Nombre banco *</Label>
                <Input
                  id="ba-bankName"
                  placeholder="Banco Santander"
                  value={form.bankName}
                  onChange={(e) => setField("bankName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de cuenta</Label>
                <Select
                  value={form.accountType}
                  onValueChange={(v) => setField("accountType", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Corriente</SelectItem>
                    <SelectItem value="SAVINGS">Ahorro</SelectItem>
                    <SelectItem value="VISTA">Vista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-accountNumber">N. de cuenta *</Label>
                <Input
                  id="ba-accountNumber"
                  placeholder="0123456789"
                  value={form.accountNumber}
                  onChange={(e) => setField("accountNumber", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setField("currency", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UF">UF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ba-holderName">Nombre titular</Label>
                <Input
                  id="ba-holderName"
                  value={form.holderName}
                  onChange={(e) => setField("holderName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-holderRut">RUT titular</Label>
                <Input
                  id="ba-holderRut"
                  placeholder="12.345.678-9"
                  value={form.holderRut}
                  onChange={(e) => setField("holderRut", e.target.value)}
                />
              </div>
            </div>

            {accountPlans.length > 0 && (
              <div className="space-y-1.5">
                <Label>Cuenta contable</Label>
                <Select
                  value={form.accountPlanId}
                  onValueChange={(v) => setField("accountPlanId", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin asignar</SelectItem>
                    {accountPlans.map((ap) => (
                      <SelectItem key={ap.id} value={ap.id}>
                        {ap.code} - {ap.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ba-isDefault"
                checked={form.isDefault}
                onChange={(e) => setField("isDefault", e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="ba-isDefault">Cuenta por defecto</Label>
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
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 2: Movimientos
   ═══════════════════════════════════════════════ */

function TransactionsTab({ accounts }: { accounts: BankAccountRow[] }) {
  const [selectedAccount, setSelectedAccount] = useState(
    accounts.length > 0 ? accounts[0].id : ""
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ bankAccountId: selectedAccount });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/finance/banking/transactions?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTransactions(json.data ?? []);
    } catch {
      toast.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateFrom, dateTo]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap">
        <div className="space-y-1.5 min-w-[200px]">
          <Label>Cuenta</Label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar cuenta..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.bankName} - {a.accountNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-from">Desde</Label>
          <Input
            id="tx-from"
            type="date"
            className="h-9 w-40"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-to">Hasta</Label>
          <Input
            id="tx-to"
            type="date"
            className="h-9 w-40"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedAccount ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-10 w-10" />}
          title="Seleccione una cuenta"
          description="Elija una cuenta bancaria para ver sus movimientos."
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-10 w-10" />}
          title="Sin movimientos"
          description="No hay movimientos registrados para esta cuenta."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {transactions.length} movimiento(s)
          </p>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Descripción</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Referencia</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                        Monto
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                        Saldo
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const rcCfg = RECONC_STATUS_CONFIG[tx.reconciliationStatus] ?? {
                        label: tx.reconciliationStatus,
                        className: "bg-muted",
                      };
                      return (
                        <tr
                          key={tx.id}
                          className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {format(new Date(tx.transactionDate), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </td>
                          <td className="px-4 py-3">{tx.description}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {tx.reference ?? "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-mono text-xs font-medium",
                              tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {fmtCLP.format(tx.amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {tx.balance != null ? fmtCLP.format(tx.balance) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={cn("text-xs", rcCfg.className)}
                            >
                              {rcCfg.label}
                            </Badge>
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
          <div className="md:hidden space-y-2 min-w-0">
            {transactions.map((tx) => {
              const rcCfg = RECONC_STATUS_CONFIG[tx.reconciliationStatus] ?? {
                label: tx.reconciliationStatus,
                className: "bg-muted",
              };
              return (
                <Card key={tx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(tx.transactionDate), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", rcCfg.className)}
                          >
                            {rcCfg.label}
                          </Badge>
                        </div>
                        <p className="text-sm">{tx.description}</p>
                        {tx.reference && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {tx.reference}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span
                            className={cn(
                              "font-mono text-sm font-medium",
                              tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {fmtCLP.format(tx.amount)}
                          </span>
                          {tx.balance != null && (
                            <span className="text-xs text-muted-foreground font-mono">
                              Saldo: {fmtCLP.format(tx.balance)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
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

/* ═══════════════════════════════════════════════
   Tab 3: Importar Cartola
   ═══════════════════════════════════════════════ */

function ImportTab({
  accounts,
  canManage,
}: {
  accounts: BankAccountRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedAccount, setSelectedAccount] = useState(
    accounts.length > 0 ? accounts[0].id : ""
  );
  const [bankFormat, setBankFormat] = useState("SANTANDER");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(
    null
  );

  const handleUpload = async () => {
    if (!file || !selectedAccount) {
      toast.error("Seleccione una cuenta y un archivo");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bankAccountId", selectedAccount);
      formData.append("bankFormat", bankFormat);

      const res = await fetch("/api/finance/banking/transactions/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al importar cartola");
      }
      const json = await res.json();
      setResult({
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
      });
      toast.success(`Cartola importada: ${json.imported ?? 0} movimientos`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setUploading(false);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={<Upload className="h-10 w-10" />}
        title="Sin permisos"
        description="No tiene permisos para importar cartolas."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cuenta bancaria *</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.bankName} - {a.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Select value={bankFormat} onValueChange={setBankFormat}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SANTANDER">Santander</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-file">Archivo de cartola (.xlsx, .xls)</Label>
            <Input
              ref={fileRef}
              id="import-file"
              type="file"
              accept=".xlsx,.xls"
              className="h-9"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleUpload} disabled={uploading || !file || !selectedAccount}>
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1.5" />
              )}
              Importar
            </Button>
          </div>

          {result && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p>
                Movimientos importados:{" "}
                <span className="font-medium">{result.imported}</span>
              </p>
              {result.skipped > 0 && (
                <p className="text-muted-foreground">
                  Omitidos (duplicados):{" "}
                  <span className="font-medium">{result.skipped}</span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
