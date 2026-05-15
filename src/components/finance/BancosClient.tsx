"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, EmptyState, Tag, type DataTableColumn } from "@/components/opai-ds";
import { PaginationControls } from "./PaginationControls";
import { BankBalanceSheet } from "./BankBalanceSheet";
import { BankRulesClient } from "./BankRulesClient";
import { BankTxReconcileSheet } from "./BankTxReconcileSheet";
import { CategoryMappingDialog } from "./cashflow/CategoryMappingDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { BulkReconcileToDteDialog } from "./BulkReconcileToDteDialog";
import { BankAnalysisClient } from "./BankAnalysisClient";
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
  FileText,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Wallet,
  EyeOff,
  RotateCcw,
  Settings2,
  BarChart3,
  CheckCircle2,
  Mail,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  History,
  CheckCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

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
  /** Tipo contable: ASSET, LIABILITY, EQUITY, REVENUE, COST, EXPENSE. */
  type?: string;
}

interface Props {
  accounts: BankAccountRow[];
  accountPlans: AccountOption[];
  canManage: boolean;
  /** Email único del tenant para suscripción automática de cartolas. */
  cartolaInboxEmail: string;
}

interface TransactionRow {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  reconciliationStatus: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  suggestedRuleId: string | null;
  suggestedRuleName: string | null;
  suggestedAccountPlanId: string | null;
  suggestedAccountLabel: string | null;
  rutRecognition: {
    rut: string | null;
    kind: "client" | "factoring" | "supplier" | "guardia" | "unknown";
    entityId: string | null;
    entityName: string | null;
  } | null;
}

type TxSubTab = "all" | "recognized" | "unrecognized" | "matched";

const TX_SUB_TABS: { id: TxSubTab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "recognized", label: "Reconocidos" },
  { id: "unrecognized", label: "Sin reconocer" },
  { id: "matched", label: "Conciliados" },
];

/* ── Constants ── */

const TABS = [
  { id: "cashflow", label: "Flujo de caja", icon: Wallet },
  { id: "transactions", label: "Movimientos", icon: ArrowLeftRight },
  { id: "analysis", label: "Análisis", icon: BarChart3 },
  { id: "rules", label: "Reglas", icon: Settings2 },
  { id: "accounts", label: "Cuentas Bancarias", icon: Landmark },
  { id: "import", label: "Importar Cartola", icon: Upload },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  CHECKING: {
    label: "Corriente",
    className: "bg-status-info-soft text-status-info-fg border-status-info-border",
  },
  SAVINGS: {
    label: "Ahorro",
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  },
  VISTA: {
    label: "Vista",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
};

const RECONC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNMATCHED: {
    label: "Sin conciliar",
    className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  },
  MATCHED: {
    label: "Conciliado",
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  },
  RECONCILED: {
    label: "Reconciliado",
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  },
  EXCLUDED: {
    label: "Excluido",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

/**
 * Parse a YYYY-MM-DD (or full ISO) date string as a *local* Date, evitando
 * el shift de timezone que ocurre cuando Postgres devuelve `2026-05-11T00:00:00.000Z`
 * y JS lo interpreta como medianoche UTC, mostrando "10 may" en GMT-3.
 */
function parseLocalDate(iso: string): Date {
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

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

export function BancosClient({
  accounts,
  accountPlans,
  canManage,
  cartolaInboxEmail,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("transactions");

  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (!t) return;
    const valid = TABS.some((tab) => tab.id === t) && t !== "cashflow";
    if (valid) setActiveTab(t as TabId);
  }, [searchParams]);

  // Auto-abrir el drawer de conciliación cuando llega `?txId=...` desde
  // un DTE pagado (deep link cross-módulo). El TransactionsTab observa
  // `searchParams` y abre el sheet con esa tx cuando aparece en la lista.

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
                onClick={() => {
                  // "Flujo de caja" vive en su propia ruta (server component
                  // que carga la proyección). El resto son tabs in-page.
                  if (tab.id === "cashflow") {
                    router.push("/finanzas/flujo-caja");
                    return;
                  }
                  setActiveTab(tab.id);
                }}
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
        <TransactionsTab
          accounts={accounts}
          canManage={canManage}
          accountPlans={accountPlans}
        />
      )}
      {activeTab === "analysis" && (
        <BankAnalysisClient
          accounts={accounts.map((a) => ({
            id: a.id,
            bankName: a.bankName,
            accountNumber: a.accountNumber,
          }))}
        />
      )}
      {activeTab === "rules" && (
        <BankRulesClient canManage={canManage} accountPlans={accountPlans} />
      )}
      {activeTab === "import" && (
        <ImportTab
          accounts={accounts}
          canManage={canManage}
          cartolaInboxEmail={cartolaInboxEmail}
        />
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
  const [balanceSheet, setBalanceSheet] = useState<BankAccountRow | null>(null);

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

  const accountColumns = useMemo<DataTableColumn<BankAccountRow>[]>(() => {
    const cols: DataTableColumn<BankAccountRow>[] = [
      {
        id: "bankName",
        header: "Banco",
        cell: (row) => (
          <div className="flex items-center gap-1.5">
            {row.bankName}
            {row.isDefault && (
              <Star className="h-3.5 w-3.5 text-status-warn-fg fill-amber-400" />
            )}
          </div>
        ),
      },
      {
        id: "accountType",
        header: "Tipo",
        cell: (row) => {
          const typeCfg = ACCOUNT_TYPE_LABELS[row.accountType] ?? {
            label: row.accountType,
            className: "bg-muted",
          };
          return (
            <Badge variant="outline" className={cn("text-xs", typeCfg.className)}>
              {typeCfg.label}
            </Badge>
          );
        },
      },
      {
        id: "accountNumber",
        header: "N. Cuenta",
        cell: (row) => <span className="font-mono text-xs">{row.accountNumber}</span>,
      },
      {
        id: "holderName",
        header: "Titular",
        cell: (row) => (
          <div>
            <div>{row.holderName}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.holderRut}
            </div>
          </div>
        ),
      },
      {
        id: "currency",
        header: "Moneda",
        cell: (row) => <span className="text-xs">{row.currency}</span>,
      },
      {
        id: "currentBalance",
        header: "Saldo",
        align: "right",
        cell: (row) => fmtCLP.format(row.currentBalance),
      },
      {
        id: "isActive",
        header: "Estado",
        align: "center",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              row.isActive
                ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
            )}
          >
            {row.isActive ? "Activa" : "Inactiva"}
          </Badge>
        ),
      },
    ];
    cols.push({
      id: "_actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Saldo a fecha"
            onClick={() => setBalanceSheet(row)}
          >
            <Wallet className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="Editar"
                onClick={() => openEdit(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Eliminar"
                onClick={() => handleDelete(row.id)}
                disabled={deleting === row.id}
              >
                {deleting === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                )}
              </Button>
            </>
          )}
        </div>
      ),
    });
    return cols;
  }, [canManage, openEdit, handleDelete, deleting]);

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
          icon={Landmark}
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
            <DataTable
              columns={accountColumns}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={Landmark} title="Sin cuentas bancarias" compact />}
            />
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
                            <Star className="h-3.5 w-3.5 text-status-warn-fg fill-amber-400 shrink-0" />
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
                                ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
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
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Saldo a fecha"
                          onClick={() => setBalanceSheet(a)}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <>
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
                          </>
                        )}
                      </div>
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
                <SearchableSelect
                  value={form.accountPlanId}
                  options={accountPlans.map((ap) => ({
                    id: ap.id,
                    label: `${ap.code} - ${ap.name}`,
                    description: ap.code,
                  }))}
                  placeholder="Seleccionar..."
                  emptyText="No se encontraron cuentas contables"
                  onChange={(v) => setField("accountPlanId", v)}
                />
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

      {balanceSheet && (
        <BankBalanceSheet
          open={!!balanceSheet}
          onOpenChange={(open) => !open && setBalanceSheet(null)}
          bankAccountId={balanceSheet.id}
          bankAccountLabel={`${balanceSheet.bankName} - ${balanceSheet.accountNumber}`}
          canManage={canManage}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 2: Movimientos
   ═══════════════════════════════════════════════ */

type TxSortField = "transactionDate" | "description" | "amount";
type TxSortDir = "asc" | "desc";

function TransactionsTab({
  accounts,
  canManage,
  accountPlans,
}: {
  accounts: BankAccountRow[];
  canManage: boolean;
  accountPlans: AccountOption[];
}) {
  const [selectedAccount, setSelectedAccount] = useState(
    accounts.length > 0 ? accounts[0].id : ""
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  // Búsqueda con debounce 250ms para no atacar el endpoint en cada tecla.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<TxSortField>("transactionDate");
  const [sortDir, setSortDir] = useState<TxSortDir>("desc");
  const [showHidden, setShowHidden] = useState(false);
  const [subTab, setSubTab] = useState<TxSubTab>("all");
  // Filtro por dirección del flujo (post 2026-05): "all" | "inflow" | "outflow".
  // Antes no existía y el usuario tenía que mirar el color/signo de cada fila.
  const [direction, setDirection] = useState<"all" | "inflow" | "outflow">("all");
  const [authorizing, setAuthorizing] = useState<string | null>(null);
  const [bulkAuthorizing, setBulkAuthorizing] = useState(false);
  // Auto-conciliación contra DTEs / turnos extras / reglas para todos
  // los movimientos UNMATCHED visibles de la cuenta. Útil cuando se
  // agrega un matcher nuevo (p.ej. turnos extras) y queremos pasarlo
  // por encima del histórico sin re-importar la cartola.
  const [runningAutoMatch, setRunningAutoMatch] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  // Mobile: filtros colapsados por defecto para dejar más espacio a la
  // tabla de movimientos. En desktop siempre visibles inline.
  const isMobile = useIsMobileViewport();
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const activeFiltersCount =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (direction !== "all" ? 1 : 0);
  const selectedAccountLabel = useMemo(() => {
    const a = accounts.find((x) => x.id === selectedAccount);
    return a ? `${a.bankName} · ${a.accountNumber}` : "Sin cuenta";
  }, [accounts, selectedAccount]);
  // Diálogo "Ocultar movimiento"
  const [hideDialog, setHideDialog] = useState<TransactionRow | null>(null);
  const [hideReason, setHideReason] = useState("");
  const [hiding, setHiding] = useState(false);
  // Drawer de conciliación
  const [reconcileTx, setReconcileTx] = useState<TransactionRow | null>(null);

  // ── Selección múltiple para bulk-assign ──
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  // Conciliación masiva contra 1+ DTEs (post 2026-05).
  const [bulkReconcileOpen, setBulkReconcileOpen] = useState(false);
  // Ocultar masivo (post 2026-05).
  const [bulkHideOpen, setBulkHideOpen] = useState(false);
  const [bulkHideReason, setBulkHideReason] = useState("");
  const [bulkHiding, setBulkHiding] = useState(false);
  // Cola de conciliación uno-por-uno (post 2026-05). El sheet existente
  // (`reconcileTx`) se reutiliza, navegando entre items con `queueIndex`.
  const [reconcileQueue, setReconcileQueue] = useState<TransactionRow[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const toggleSelectTx = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedTxIds(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const toggleSort = useCallback((field: TxSortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        // Misma columna: invierte dirección
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        return field;
      }
      // Nueva columna: defaults razonables (fecha/monto desc, descripción asc)
      setSortDir(field === "description" ? "asc" : "desc");
      return field;
    });
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        bankAccountId: selectedAccount,
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sortField,
        sortDir,
        visibility: showHidden ? "hidden" : "visible",
        tab: subTab,
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (direction !== "all") params.set("direction", direction);
      const res = await fetch(`/api/finance/banking/transactions?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      // El endpoint retorna { success, data: { transactions, total, page, ... } }
      const list = Array.isArray(json.data) ? json.data : json.data?.transactions;
      setTransactions(Array.isArray(list) ? list : []);
      setTotal(typeof json.data?.total === "number" ? json.data.total : 0);
    } catch {
      toast.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [
    selectedAccount,
    dateFrom,
    dateTo,
    debouncedSearch,
    sortField,
    sortDir,
    showHidden,
    subTab,
    direction,
    page,
    pageSize,
  ]);

  // Resetea a la página 1 cuando cambian filtros (cuenta, fechas, búsqueda, orden, visibilidad o sub-tab)
  useEffect(() => {
    setPage(1);
  }, [
    selectedAccount,
    dateFrom,
    dateTo,
    debouncedSearch,
    sortField,
    sortDir,
    showHidden,
    subTab,
    direction,
  ]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Deep-link cross-módulo: cuando un DTE pagado linkea a `?txId=...` o
  // `?openTx=...`, auto-abrimos el drawer de conciliación de esa tx.
  // Si la tx no está cargada todavía (por filtros/paginación), hacemos
  // un fetch dirigido al endpoint individual.
  //
  // Tras abrir el drawer, LIMPIAMOS el query param de la URL para que:
  //   - cerrar el drawer no vuelva a reabrirlo
  //   - un refresh o nav back-y-forward no fuerce reabrir un drawer que
  //     el usuario ya cerró
  // Usamos un ref para no reentrar al mismo txId.
  const txTabSearchParams = useSearchParams();
  const txTabPathname = usePathname();
  const txTabRouter = useRouter();
  const requestedTxId =
    txTabSearchParams.get("txId") || txTabSearchParams.get("openTx");
  const consumedTxIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedTxId) return;
    if (consumedTxIdRef.current === requestedTxId) return;
    consumedTxIdRef.current = requestedTxId;
    const clearQuery = () => {
      // Mantiene cualquier otro query (ej. tab=) y solo elimina los
      // deep-link params. Si quedan vacíos, queda la ruta limpia.
      const next = new URLSearchParams(
        Array.from(txTabSearchParams.entries()),
      );
      next.delete("txId");
      next.delete("openTx");
      const qs = next.toString();
      txTabRouter.replace(qs ? `${txTabPathname}?${qs}` : txTabPathname, {
        scroll: false,
      });
    };
    const inList = transactions.find((t) => t.id === requestedTxId);
    if (inList) {
      setReconcileTx(inList);
      clearQuery();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/finance/banking/transactions/${requestedTxId}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.success || !json.data) return;
        setReconcileTx(json.data as TransactionRow);
        clearQuery();
      } catch {
        // silencioso: si la tx no existe, no abrimos nada
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedTxId, transactions, txTabPathname, txTabRouter, txTabSearchParams]);

  const submitHide = async () => {
    if (!hideDialog || !hideReason.trim()) {
      toast.error("Indicá el motivo");
      return;
    }
    setHiding(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${hideDialog.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "hide", reason: hideReason.trim() }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al ocultar movimiento");
      }
      toast.success("Movimiento ocultado");
      setHideDialog(null);
      setHideReason("");
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setHiding(false);
    }
  };

  const authorizeSuggestion = async (txId: string) => {
    setAuthorizing(txId);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${txId}/confirm-suggestion`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Movimiento autorizado");
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al autorizar");
    } finally {
      setAuthorizing(null);
    }
  };

  const undoReconciliation = async (txId: string) => {
    if (
      !confirm(
        "¿Deshacer la conciliación de este movimiento? Se eliminan los vínculos contables y vuelve a estado UNMATCHED."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${txId}/links`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Conciliación deshecha");
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al deshacer");
    }
  };

  const authorizeAll = async () => {
    if (!selectedAccount) return;
    if (
      !confirm(
        "¿Autorizar todos los movimientos reconocidos visibles? Crearán los vínculos contables sugeridos por las reglas."
      )
    ) {
      return;
    }
    setBulkAuthorizing(true);
    try {
      const res = await fetch(
        "/api/finance/banking/transactions/confirm-suggestions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankAccountId: selectedAccount }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(
        `${(json.data?.confirmed ?? 0).toLocaleString("es-CL")} movimientos autorizados`
      );
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error en autorización masiva");
    } finally {
      setBulkAuthorizing(false);
    }
  };

  const runHistoricalAutoMatch = async () => {
    if (!selectedAccount) return;
    if (
      !confirm(
        "¿Correr conciliación automática sobre los movimientos sin reconocer? Se evalúan DTEs, turnos extras y reglas (los matches con confianza alta quedan conciliados, los demás como sugerencia)."
      )
    ) {
      return;
    }
    setRunningAutoMatch(true);
    try {
      const res = await fetch(
        "/api/finance/banking/automatch-rules/run-historical",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankAccountId: selectedAccount }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      const s = json.data ?? {};
      const dteCount = s.matched ?? 0;
      const teCount = s.turnoExtraMatched ?? 0;
      const ruleCount = s.ruleMatched ?? 0;
      const total = dteCount + teCount + ruleCount;
      if (total === 0) {
        // Desglose para que el usuario sepa POR QUÉ no hubo matches.
        // BulkAutoMatchSummary expone noCandidate, ambiguous, skipped y
        // scanned; los usamos sin lógica nueva.
        const breakdown: string[] = [];
        if (s.noCandidate)
          breakdown.push(`${s.noCandidate} sin candidato DTE`);
        if (s.ambiguous) breakdown.push(`${s.ambiguous} ambiguos`);
        if (s.skipped) breakdown.push(`${s.skipped} omitidos`);
        const detail = breakdown.length > 0 ? ` (${breakdown.join(" · ")})` : "";
        toast.info(
          `Escaneados ${s.scanned ?? 0} movimientos. Ningún match nuevo${detail}.`,
        );
      } else {
        const parts: string[] = [];
        if (dteCount) parts.push(`${dteCount} DTE`);
        if (teCount) parts.push(`${teCount} turno extra`);
        if (ruleCount) parts.push(`${ruleCount} por reglas`);
        toast.success(`Conciliados: ${parts.join(" · ")}`);
      }
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error en auto-conciliación");
    } finally {
      setRunningAutoMatch(false);
    }
  };

  const restoreTransaction = async (txId: string) => {
    try {
      const res = await fetch(`/api/finance/banking/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unhide" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al restaurar");
      }
      toast.success("Movimiento restaurado");
      loadTransactions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const sortableHeader = useCallback(
    (label: string, field: TxSortField, align: "left" | "right" = "left") => (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse"
        )}
      >
        <span>{label}</span>
        {sortField === field ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    ),
    [sortField, sortDir, toggleSort]
  );

  // Estado tri-state del checkbox header (todos / parcial / ninguno).
  const visibleTxIds = transactions.map((t) => t.id);
  const visibleSelectedCount = visibleTxIds.filter((id) =>
    selectedTxIds.has(id),
  ).length;
  const headerCheckboxState: "all" | "some" | "none" =
    visibleSelectedCount === 0
      ? "none"
      : visibleSelectedCount === visibleTxIds.length
        ? "all"
        : "some";

  const toggleAllVisible = useCallback(() => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (visibleSelectedCount === visibleTxIds.length) {
        // Todos seleccionados → deseleccionar visibles.
        visibleTxIds.forEach((id) => next.delete(id));
      } else {
        // Algunos o ninguno → seleccionar todos los visibles.
        visibleTxIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleSelectedCount, visibleTxIds]);

  const transactionColumns = useMemo<DataTableColumn<TransactionRow>[]>(
    () => [
      {
        // Checkbox de selección (post 2026-05): antes solo existía en
        // mobile, lo que impedía conciliación masiva desde desktop.
        id: "_select",
        header: (
          <input
            type="checkbox"
            aria-label="Seleccionar todos los visibles"
            checked={headerCheckboxState === "all"}
            ref={(el) => {
              if (el) el.indeterminate = headerCheckboxState === "some";
            }}
            onChange={toggleAllVisible}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-ds-border-default bg-ds-surface-2 text-primary cursor-pointer"
          />
        ),
        width: "w-10",
        cell: (row) => (
          <input
            type="checkbox"
            aria-label={`Seleccionar mov ${row.id}`}
            checked={selectedTxIds.has(row.id)}
            onChange={() => toggleSelectTx(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-ds-border-default bg-ds-surface-2 text-primary cursor-pointer"
          />
        ),
      },
      {
        id: "transactionDate",
        header: sortableHeader("Fecha", "transactionDate"),
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {format(parseLocalDate(row.transactionDate), "dd MMM yyyy", { locale: es })}
          </span>
        ),
      },
      {
        id: "description",
        header: sortableHeader("Descripción", "description"),
        cell: (row) => {
          const rr = row.rutRecognition;
          const kindLabel =
            rr?.kind === "client"
              ? "Cliente"
              : rr?.kind === "factoring"
                ? "Factoring"
                : rr?.kind === "supplier"
                  ? "Proveedor"
                  : rr?.kind === "guardia"
                    ? "Guardia"
                    : null;
          const recognizedVariant =
            rr?.kind === "factoring" ? ("brand" as const) : ("ok" as const);
          return (
            <div className="flex flex-col gap-1 min-w-0">
              <span className="truncate">{row.description}</span>
              {rr?.kind && rr.kind !== "unknown" && rr.entityName ? (
                <span
                  className="flex flex-wrap items-center gap-1"
                  title={`RUT ${rr.rut ?? ""} reconocido como ${kindLabel}`}
                >
                  <Tag variant={recognizedVariant} size="sm">
                    {kindLabel}: {rr.entityName}
                  </Tag>
                  {row.reconciliationStatus === "UNMATCHED" &&
                  rr.kind === "factoring" ? (
                    <Tag variant="info" size="sm">
                      Posible cesión
                    </Tag>
                  ) : null}
                </span>
              ) : rr?.rut ? (
                <span
                  title="RUT detectado en la cartola pero sin contraparte en el ERP"
                >
                  <Tag variant="neutral" size="sm">
                    RUT no reconocido
                  </Tag>
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "reference",
        header: "Referencia",
        cell: (row) => (
          <span className="text-xs text-muted-foreground font-mono">
            {row.reference ?? "—"}
          </span>
        ),
      },
      {
        id: "amount",
        header: sortableHeader("Monto", "amount", "right"),
        align: "right",
        cell: (row) => (
          <span
            className={
              row.amount >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"
            }
          >
            {fmtCLP.format(row.amount)}
          </span>
        ),
      },
      {
        id: "balance",
        header: "Saldo",
        align: "right",
        cell: (row) => (row.balance != null ? fmtCLP.format(row.balance) : "—"),
      },
      {
        id: "reconciliationStatus",
        header: "Estado",
        cell: (row) => {
          if (row.hiddenAt) {
            return (
              <Badge
                variant="outline"
                className="text-xs bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                title={row.hiddenReason ?? undefined}
              >
                Oculto
              </Badge>
            );
          }
          if (row.suggestedRuleId && row.reconciliationStatus === "UNMATCHED") {
            return (
              <div className="flex flex-col gap-0.5">
                <Badge
                  variant="outline"
                  className="text-xs bg-status-info-soft text-status-info-fg border-status-info-border"
                  title={`Sugerido por: ${row.suggestedRuleName ?? "regla"}`}
                >
                  Reconocido
                </Badge>
                {row.suggestedAccountLabel && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                    → {row.suggestedAccountLabel}
                  </span>
                )}
              </div>
            );
          }
          const rcCfg = RECONC_STATUS_CONFIG[row.reconciliationStatus] ?? {
            label: row.reconciliationStatus,
            className: "bg-muted",
          };
          return (
            <Badge
              variant="outline"
              className={cn("text-xs", rcCfg.className)}
            >
              {rcCfg.label}
            </Badge>
          );
        },
      },
      {
        id: "_actions",
        header: "",
        align: "right",
        cell: (row) =>
          canManage ? (
            row.hiddenAt ? (
              <Button
                variant="ghost"
                size="sm"
                title="Restaurar"
                onClick={(e) => {
                  e.stopPropagation();
                  restoreTransaction(row.id);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <div className="flex items-center justify-end gap-1">
                {row.suggestedRuleId && row.reconciliationStatus === "UNMATCHED" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs"
                    title={`Autorizar: ${row.suggestedAccountLabel ?? ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      authorizeSuggestion(row.id);
                    }}
                    disabled={authorizing === row.id}
                  >
                    {authorizing === row.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    Autorizar
                  </Button>
                )}
                {(row.reconciliationStatus === "MATCHED" ||
                  row.reconciliationStatus === "RECONCILED") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Deshacer conciliación"
                    onClick={(e) => {
                      e.stopPropagation();
                      undoReconciliation(row.id);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  title="Ocultar (no es caja)"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHideDialog(row);
                    setHideReason("");
                  }}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          ) : null,
      },
    ],
    [
      sortableHeader,
      canManage,
      authorizing,
      headerCheckboxState,
      toggleAllVisible,
      selectedTxIds,
    ]
  );

  return (
    <div className="space-y-4">
      {/* Filters — compactos en mobile (resumen + chevron), inline en desktop */}
      {isMobile && (
        <div className="rounded-lg border border-border bg-card/50 px-3 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpenMobile((v) => !v)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
            aria-expanded={filtersOpenMobile}
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate">{selectedAccountLabel}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {dateFrom || dateTo
                  ? `${dateFrom || "…"} → ${dateTo || "…"}`
                  : "Sin rango"}
                {activeFiltersCount > 0 ? ` · ${activeFiltersCount} filtro${activeFiltersCount === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            {filtersOpenMobile ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap",
          isMobile && !filtersOpenMobile && "hidden",
        )}
      >
        <div className="space-y-1.5 min-w-[200px] sm:flex-initial flex-1">
          <Label>Cuenta</Label>
          <SearchableSelect
            value={selectedAccount}
            options={accounts.map((a) => ({
              id: a.id,
              label: `${a.bankName} - ${a.accountNumber}`,
            }))}
            placeholder="Seleccionar cuenta..."
            emptyText="No se encontraron cuentas"
            onChange={setSelectedAccount}
          />
        </div>
        <div className="space-y-1.5 flex-1 sm:flex-initial">
          <Label htmlFor="tx-from">Desde</Label>
          <Input
            id="tx-from"
            type="date"
            className="h-9 sm:w-40 w-full"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 flex-1 sm:flex-initial">
          <Label htmlFor="tx-to">Hasta</Label>
          <Input
            id="tx-to"
            type="date"
            className="h-9 sm:w-40 w-full"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[220px]">
          <Label htmlFor="tx-search">Buscar</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tx-search"
              type="text"
              placeholder="Descripción o referencia…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5 sm:flex-initial">
          <Label>Tipo</Label>
          <div className="flex h-9 rounded-md border border-input overflow-hidden text-[13px]">
            <button
              type="button"
              onClick={() => setDirection("all")}
              className={
                "px-3 font-medium transition-colors " +
                (direction === "all"
                  ? "bg-primary/15 text-primary"
                  : "bg-background text-muted-foreground hover:bg-muted/40")
              }
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setDirection("inflow")}
              className={
                "px-3 font-medium transition-colors border-l border-input " +
                (direction === "inflow"
                  ? "bg-status-ok-soft text-status-ok-fg"
                  : "bg-background text-muted-foreground hover:bg-muted/40")
              }
            >
              ↑ Ingresos
            </button>
            <button
              type="button"
              onClick={() => setDirection("outflow")}
              className={
                "px-3 font-medium transition-colors border-l border-input " +
                (direction === "outflow"
                  ? "bg-status-danger-soft text-status-danger-fg"
                  : "bg-background text-muted-foreground hover:bg-muted/40")
              }
            >
              ↓ Egresos
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Button
            type="button"
            variant={showHidden ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? (
              <>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Ver visibles
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                Ver ocultos
              </>
            )}
          </Button>
          {isMobile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setFiltersOpenMobile(false)}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cerrar
            </Button>
          )}
        </div>
      </div>

      {/* Sub-pills + bulk action */}
      {!showHidden && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
            {TX_SUB_TABS.map((t) => {
              const isActive = subTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0",
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {subTab === "recognized" && canManage && transactions.length > 0 && (
            <Button
              size="sm"
              onClick={authorizeAll}
              disabled={bulkAuthorizing}
              className="h-8 shrink-0"
            >
              {bulkAuthorizing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Autorizar todos
            </Button>
          )}
          {(subTab === "all" || subTab === "unrecognized") &&
            canManage &&
            selectedAccount && (
              <Button
                size="sm"
                variant="outline"
                onClick={runHistoricalAutoMatch}
                disabled={runningAutoMatch}
                className="h-8 shrink-0"
                title="Corre el matcher contra DTEs, turnos extras y reglas configuradas"
              >
                {runningAutoMatch ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                )}
                Auto-conciliar
              </Button>
            )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedAccount ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Seleccione una cuenta"
          description="Elija una cuenta bancaria para ver sus movimientos."
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Sin movimientos"
          description="No hay movimientos registrados para esta cuenta."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable
              columns={transactionColumns}
              rows={transactions}
              rowKey={(row) => row.id}
              onRowClick={
                canManage
                  ? (row) => {
                      if (!row.hiddenAt) setReconcileTx(row);
                    }
                  : undefined
              }
              empty={<EmptyState icon={ArrowLeftRight} title="Sin movimientos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2 min-w-0">
            {transactions.map((tx) => {
              const rcCfg = RECONC_STATUS_CONFIG[tx.reconciliationStatus] ?? {
                label: tx.reconciliationStatus,
                className: "bg-muted",
              };
              return (
                <Card
                  key={tx.id}
                  className={cn(
                    tx.hiddenAt ? "opacity-60" : undefined,
                    canManage && !tx.hiddenAt && "cursor-pointer hover:bg-muted/30",
                    selectedTxIds.has(tx.id) && "ring-1 ring-primary/40"
                  )}
                  onClick={
                    canManage && !tx.hiddenAt
                      ? (e) => {
                          // No abrir el sheet si el click fue sobre el checkbox o sus children
                          const target = e.target as HTMLElement;
                          if (target.closest("[data-bulk-checkbox]")) return;
                          setReconcileTx(tx);
                        }
                      : undefined
                  }
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {canManage && !tx.hiddenAt && (
                        <div
                          data-bulk-checkbox
                          className="pt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedTxIds.has(tx.id)}
                            onCheckedChange={() => toggleSelectTx(tx.id)}
                            aria-label="Seleccionar movimiento"
                          />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {format(parseLocalDate(tx.transactionDate), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </span>
                          {tx.hiddenAt ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                              title={tx.hiddenReason ?? undefined}
                            >
                              Oculto
                            </Badge>
                          ) : tx.suggestedRuleId &&
                            tx.reconciliationStatus === "UNMATCHED" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-status-info-soft text-status-info-fg border-status-info-border"
                            >
                              Reconocido
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", rcCfg.className)}
                            >
                              {rcCfg.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm">{tx.description}</p>
                        {tx.reference && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {tx.reference}
                          </p>
                        )}
                        {tx.hiddenAt && tx.hiddenReason && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            Motivo: {tx.hiddenReason}
                          </p>
                        )}
                        {tx.suggestedAccountLabel &&
                          tx.reconciliationStatus === "UNMATCHED" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">
                                {tx.suggestedRuleName ?? "Regla"}:
                              </span>{" "}
                              → {tx.suggestedAccountLabel}
                            </p>
                          )}
                        <div className="flex items-center justify-between mt-2">
                          <span
                            className={cn(
                              "font-mono text-sm font-medium",
                              tx.amount >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"
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
                      {canManage && (
                        <div className="shrink-0 flex items-center gap-1">
                          {tx.hiddenAt ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Restaurar"
                              onClick={(e) => {
                                e.stopPropagation();
                                restoreTransaction(tx.id);
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <>
                              {tx.suggestedRuleId &&
                                tx.reconciliationStatus === "UNMATCHED" && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      authorizeSuggestion(tx.id);
                                    }}
                                    disabled={authorizing === tx.id}
                                  >
                                    {authorizing === tx.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                              {(tx.reconciliationStatus === "MATCHED" ||
                                tx.reconciliationStatus === "RECONCILED") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Deshacer conciliación"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    undoReconciliation(tx.id);
                                  }}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Ocultar (no es caja)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHideDialog(tx);
                                  setHideReason("");
                                }}
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            loading={loading}
          />
        </>
      )}

      <Dialog
        open={!!hideDialog}
        onOpenChange={(open) => !open && setHideDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ocultar movimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El movimiento quedará oculto del listado y desconciliado. Podés
              restaurarlo desde la vista &ldquo;Ver ocultos&rdquo;.
            </p>
            {hideDialog && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{hideDialog.description}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseLocalDate(hideDialog.transactionDate), "dd MMM yyyy", {
                    locale: es,
                  })}
                  {" · "}
                  <span className="font-mono">
                    {fmtCLP.format(hideDialog.amount)}
                  </span>
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="hide-reason">Motivo *</Label>
              <Input
                id="hide-reason"
                placeholder="Ej. duplicado, no corresponde a caja, error de cartola..."
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                maxLength={500}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHideDialog(null)}
              disabled={hiding}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={submitHide}
              disabled={hiding || !hideReason.trim()}
            >
              {hiding && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Ocultar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BankTxReconcileSheet
        open={!!reconcileTx}
        onOpenChange={(open) => {
          if (!open) {
            setReconcileTx(null);
            // Si estábamos en cola, también limpiar.
            if (reconcileQueue.length > 0) {
              setReconcileQueue([]);
              setQueueIndex(0);
            }
          }
        }}
        tx={reconcileTx}
        accountPlans={accountPlans}
        queueInfo={
          reconcileQueue.length > 0
            ? {
                index: queueIndex,
                total: reconcileQueue.length,
                onNext: () => {
                  const nextIdx = queueIndex + 1;
                  if (nextIdx < reconcileQueue.length) {
                    setQueueIndex(nextIdx);
                    setReconcileTx(reconcileQueue[nextIdx]);
                  } else {
                    // Fin de la cola.
                    setReconcileTx(null);
                    setReconcileQueue([]);
                    setQueueIndex(0);
                    clearSelection();
                    loadTransactions();
                  }
                },
                onCancel: () => {
                  setReconcileTx(null);
                  setReconcileQueue([]);
                  setQueueIndex(0);
                  loadTransactions();
                },
              }
            : undefined
        }
        onSaved={() => {
          if (reconcileQueue.length > 0) {
            // En modo cola, avanzar al siguiente sin cerrar.
            const nextIdx = queueIndex + 1;
            if (nextIdx < reconcileQueue.length) {
              setQueueIndex(nextIdx);
              setReconcileTx(reconcileQueue[nextIdx]);
              loadTransactions();
            } else {
              setReconcileTx(null);
              setReconcileQueue([]);
              setQueueIndex(0);
              clearSelection();
              loadTransactions();
            }
          } else {
            setReconcileTx(null);
            loadTransactions();
          }
        }}
      />

      {/* Barra flotante de acciones masivas */}
      {selectedTxIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg max-w-[95vw]">
          <span className="text-[12px] font-mono text-muted-foreground">
            {selectedTxIds.size} movimiento{selectedTxIds.size === 1 ? "" : "s"} seleccionado{selectedTxIds.size === 1 ? "" : "s"}
          </span>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="default" onClick={() => setBulkAssignOpen(true)}>
            Asignar cuenta…
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setBulkReconcileOpen(true)}
            title="Conciliar todos contra una o varias facturas"
          >
            Conciliar contra DTEs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const queue = transactions.filter((t) => selectedTxIds.has(t.id));
              if (queue.length === 0) return;
              setReconcileQueue(queue);
              setQueueIndex(0);
              setReconcileTx(queue[0]);
            }}
            title="Abrir cada movimiento uno por uno"
          >
            Conciliar uno por uno
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkHideOpen(true)}
            title="Ocultar todos los movimientos seleccionados"
            className="text-status-danger-fg hover:bg-status-danger-soft"
          >
            Ocultar seleccionados
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Modal de bulk-assign */}
      <BulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        selectedIds={Array.from(selectedTxIds)}
        accountPlans={accountPlans}
        onDone={() => {
          clearSelection();
          setBulkAssignOpen(false);
          loadTransactions();
        }}
      />

      {/* Modal de conciliación masiva contra 1 DTE (post 2026-05) */}
      <BulkReconcileToDteDialog
        open={bulkReconcileOpen}
        onOpenChange={setBulkReconcileOpen}
        transactions={transactions
          .filter((t) => selectedTxIds.has(t.id))
          .map((t) => ({
            id: t.id,
            transactionDate: t.transactionDate,
            description: t.description,
            reference: t.reference,
            amount: t.amount,
          }))}
        accountPlans={accountPlans}
        onConfirmed={() => {
          clearSelection();
          loadTransactions();
        }}
      />

      {/* Modal bulk-hide: ocultar varios movimientos con un solo motivo. */}
      <Dialog
        open={bulkHideOpen}
        onOpenChange={(o) => {
          if (!o) setBulkHideReason("");
          setBulkHideOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ocultar {selectedTxIds.size} movimiento
              {selectedTxIds.size === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Los movimientos quedarán fuera del listado y desconciliados. Podés
              restaurarlos desde la vista &ldquo;Ver ocultos&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="bulk-hide-reason">Motivo *</Label>
              <Input
                id="bulk-hide-reason"
                value={bulkHideReason}
                onChange={(e) => setBulkHideReason(e.target.value)}
                placeholder="Ej: devolución sueldos, duplicados..."
                className="h-10 sm:h-9 mt-1"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkHideOpen(false)}
              disabled={bulkHiding}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!bulkHideReason.trim() || bulkHiding}
              onClick={async () => {
                if (!bulkHideReason.trim()) return;
                setBulkHiding(true);
                try {
                  const res = await fetch(
                    "/api/finance/banking/transactions/bulk-hide",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        bankTransactionIds: Array.from(selectedTxIds),
                        reason: bulkHideReason.trim(),
                      }),
                    }
                  );
                  const json = await res.json();
                  if (!res.ok || !json.success) {
                    throw new Error(json.error || "Error al ocultar");
                  }
                  toast.success(
                    `${json.data.hidden} movimiento${json.data.hidden === 1 ? "" : "s"} ocultado${json.data.hidden === 1 ? "" : "s"}`
                  );
                  clearSelection();
                  setBulkHideReason("");
                  setBulkHideOpen(false);
                  loadTransactions();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Error al ocultar"
                  );
                } finally {
                  setBulkHiding(false);
                }
              }}
            >
              {bulkHiding && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Ocultar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 3: Importar Cartola
   ═══════════════════════════════════════════════ */

interface PreviewRow {
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface PreviewData {
  totalInFile: number;
  newCount: number;
  duplicateCount: number;
  new: PreviewRow[];
  duplicates: PreviewRow[];
  accountNumberInFile: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  closingBalance: number | null;
  accountMismatch: boolean;
}

interface ImportHistoryRow {
  id: string;
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  fileName: string;
  periodFrom: string | null;
  periodTo: string | null;
  totalInFile: number;
  importedCount: number;
  duplicateCount: number;
  createdAt: string;
}

interface ImportDetail extends ImportHistoryRow {
  fileSize: number;
  bankFormat: string;
  accountNumberInFile: string | null;
  closingBalance: string | null;
  transactions: {
    id: string;
    transactionDate: string;
    description: string;
    reference: string | null;
    amount: string;
    reconciliationStatus: string;
    hiddenAt: string | null;
  }[];
}

function ImportTab({
  accounts,
  canManage,
  cartolaInboxEmail,
}: {
  accounts: BankAccountRow[];
  canManage: boolean;
  cartolaInboxEmail: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedAccount, setSelectedAccount] = useState(
    accounts.length > 0 ? accounts[0].id : ""
  );
  const [bankFormat, setBankFormat] = useState("SANTANDER");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showNew, setShowNew] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Historial de cartolas importadas
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0); // trigger reload
  const [openImport, setOpenImport] = useState<ImportDetail | null>(null);
  const [openImportLoading, setOpenImportLoading] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    setHistoryLoading(true);
    fetch("/api/finance/banking/imports?limit=20")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) setHistory(j.data as ImportHistoryRow[]);
      })
      .catch(() => {
        /* no-op: el panel principal no depende del historial */
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, historyKey]);

  const resetFlow = () => {
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = async () => {
    if (!file || !selectedAccount) {
      toast.error("Selecciona una cuenta y un archivo");
      return;
    }
    setAnalyzing(true);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bankAccountId", selectedAccount);
      formData.append("bankFormat", bankFormat);
      const res = await fetch(
        "/api/finance/banking/transactions/import/preview",
        { method: "POST", body: formData },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Error al analizar cartola");
      }
      setPreview(json.data as PreviewData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !selectedAccount) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bankAccountId", selectedAccount);
      formData.append("bankFormat", bankFormat);
      const res = await fetch("/api/finance/banking/transactions/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Error al importar cartola");
      }
      const data = json.data ?? {};
      toast.success(
        `Cartola importada: ${data.importedCount ?? 0} movimientos nuevos${
          (data.duplicateCount ?? 0) > 0
            ? `, ${data.duplicateCount} duplicados omitidos`
            : ""
        }`,
      );
      resetFlow();
      setHistoryKey((k) => k + 1);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setUploading(false);
    }
  };

  const openImportDetail = async (id: string) => {
    setOpenImportLoading(true);
    try {
      const res = await fetch(`/api/finance/banking/imports/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Error al cargar la cartola");
      }
      setOpenImport(json.data as ImportDetail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setOpenImportLoading(false);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={Upload}
        title="Sin permisos"
        description="No tiene permisos para importar cartolas."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Cartola automática por email — el banco envía la cartola al
          email único del tenant y el sistema la importa solo. */}
      <Card className="border-status-info-border bg-status-info-soft/30">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-status-info-soft text-status-info-fg shrink-0">
              <Mail className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Cartola automática por email
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configurá este email en Santander Office Banking → Suscripción
                Cartola vía email. El sistema procesará el Excel
                automáticamente cuando llegue.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <code className="text-xs sm:text-sm font-mono flex-1 truncate select-all">
              {cartolaInboxEmail}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(cartolaInboxEmail);
                toast.success("Email copiado al portapapeles");
              }}
            >
              Copiar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tildá el formato <span className="font-medium">Planilla</span>{" "}
            (Excel) en la suscripción de Santander. Ese es el archivo que el
            sistema sabe leer.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cuenta bancaria *</Label>
              <SearchableSelect
                value={selectedAccount}
                options={accounts.map((a) => ({
                  id: a.id,
                  label: `${a.bankName} - ${a.accountNumber}`,
                }))}
                placeholder="Seleccionar cuenta..."
                emptyText="No se encontraron cuentas"
                onChange={setSelectedAccount}
              />
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
            <Label>Archivo de cartola</Label>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-status-ok-border bg-status-ok-soft p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background shrink-0">
                  <FileText className="h-5 w-5 text-status-ok-fg" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => setFile(null)}
                  disabled={uploading}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
                className={cn(
                  "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Arrastra el archivo aquí o haz clic para seleccionar
                  </span>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                      XLSX
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                      XLS
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Excel descargado desde &ldquo;Historial de Cuenta&rdquo; en Santander
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!preview && (
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !file || !selectedAccount}
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1.5" />
                )}
                Analizar
              </Button>
            )}
            {preview && (
              <>
                <Button
                  onClick={handleConfirmImport}
                  disabled={uploading || preview.newCount === 0}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1.5" />
                  )}
                  Confirmar importación ({preview.newCount.toLocaleString("es-CL")})
                </Button>
                <Button variant="outline" onClick={resetFlow} disabled={uploading}>
                  Cancelar
                </Button>
              </>
            )}
          </div>

          {preview && (
            <PreviewPanel
              preview={preview}
              showNew={showNew}
              setShowNew={setShowNew}
              showDuplicates={showDuplicates}
              setShowDuplicates={setShowDuplicates}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Últimas cartolas importadas ── */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Últimas cartolas importadas</h3>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Aún no has importado cartolas. La primera importación aparecerá acá.
            </p>
          ) : (
            <div className="rounded-md border border-border divide-y divide-border">
              {history.map((row) => (
                <button
                  key={row.id}
                  onClick={() => openImportDetail(row.id)}
                  disabled={openImportLoading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {row.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.bankName} {row.accountNumber} ·{" "}
                      {format(new Date(row.createdAt), "dd MMM yyyy HH:mm", {
                        locale: es,
                      })}
                      {row.periodFrom && row.periodTo
                        ? ` · ${row.periodFrom} → ${row.periodTo}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">
                      {row.importedCount.toLocaleString("es-CL")}
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        / {row.totalInFile.toLocaleString("es-CL")}
                      </span>
                    </p>
                    {row.duplicateCount > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {row.duplicateCount} duplicados
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal con el detalle de una cartola */}
      <Dialog
        open={openImport !== null}
        onOpenChange={(o) => !o && setOpenImport(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{openImport?.fileName}</DialogTitle>
          </DialogHeader>
          {openImport && (
            <div className="flex-1 overflow-auto space-y-3 -mx-6 px-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Cuenta</p>
                  <p className="font-medium">
                    {openImport.bankName} {openImport.accountNumber}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Período</p>
                  <p className="font-medium">
                    {openImport.periodFrom ?? "?"} → {openImport.periodTo ?? "?"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Importados</p>
                  <p className="font-medium">
                    {openImport.importedCount.toLocaleString("es-CL")} /{" "}
                    {openImport.totalInFile.toLocaleString("es-CL")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saldo de cierre</p>
                  <p className="font-medium">
                    {openImport.closingBalance
                      ? new Intl.NumberFormat("es-CL", {
                          style: "currency",
                          currency: "CLP",
                          maximumFractionDigits: 0,
                        }).format(Number(openImport.closingBalance))
                      : "—"}
                  </p>
                </div>
              </div>
              {/* Lista de movimientos. En mobile la descripción puede ser
                  larga, por eso usamos flex con truncate en lugar de <table>
                  (que generaba overflow horizontal). */}
              <div className="rounded-md border border-border overflow-hidden text-xs">
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-muted/50 font-medium text-muted-foreground">
                  <span className="w-20 shrink-0">Fecha</span>
                  <span className="flex-1 min-w-0">Descripción</span>
                  <span className="w-28 text-right shrink-0">Monto</span>
                </div>
                {openImport.transactions.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">
                    Sin movimientos asociados
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {openImport.transactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2"
                      >
                        <span className="w-20 shrink-0 text-muted-foreground whitespace-nowrap font-mono">
                          {t.transactionDate}
                        </span>
                        <span className="flex-1 min-w-0 order-3 sm:order-none basis-full sm:basis-auto">
                          <span className="block truncate">{t.description}</span>
                          {t.reference && (
                            <span className="block text-[10px] text-muted-foreground truncate">
                              {t.reference}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "ml-auto sm:ml-0 sm:w-28 text-right shrink-0 whitespace-nowrap font-mono tabular-nums",
                            Number(t.amount) >= 0
                              ? "text-status-ok-fg"
                              : "text-status-error-fg",
                          )}
                        >
                          {new Intl.NumberFormat("es-CL", {
                            style: "currency",
                            currency: "CLP",
                            maximumFractionDigits: 0,
                          }).format(Number(t.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenImport(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Subcomponente: panel de pre-chequeo de cartola ── */
function PreviewPanel({
  preview,
  showNew,
  setShowNew,
  showDuplicates,
  setShowDuplicates,
}: {
  preview: PreviewData;
  showNew: boolean;
  setShowNew: (v: boolean) => void;
  showDuplicates: boolean;
  setShowDuplicates: (v: boolean) => void;
}) {
  const fmtAmount = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-3">
      {preview.accountMismatch && (
        <div className="flex items-start gap-2 rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Número de cuenta no coincide</p>
            <p className="text-xs text-muted-foreground">
              El archivo declara cuenta{" "}
              <span className="font-mono">
                {preview.accountNumberInFile ?? "?"}
              </span>{" "}
              pero estás importando a una cuenta distinta. Revisa antes de
              confirmar.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-md border border-border p-3 text-xs">
        <div>
          <p className="text-muted-foreground">Total en archivo</p>
          <p className="text-base font-semibold">
            {preview.totalInFile.toLocaleString("es-CL")}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Nuevos</p>
          <p className="text-base font-semibold text-status-ok-fg">
            {preview.newCount.toLocaleString("es-CL")}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Duplicados (omitidos)</p>
          <p className="text-base font-semibold text-muted-foreground">
            {preview.duplicateCount.toLocaleString("es-CL")}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Período</p>
          <p className="text-sm font-medium">
            {preview.periodFrom ?? "?"} → {preview.periodTo ?? "?"}
          </p>
        </div>
      </div>

      {preview.newCount === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          <p>
            Todos los movimientos del archivo ya están importados. No hay nada
            nuevo que cargar.
          </p>
        </div>
      )}

      {preview.new.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setShowNew(!showNew)}
            className="w-full flex items-center justify-between px-3 py-2 bg-status-ok-soft/50 hover:bg-status-ok-soft text-sm font-medium"
          >
            <span>
              Nuevos ({preview.new.length.toLocaleString("es-CL")})
            </span>
            {showNew ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showNew && (
            <div className="max-h-72 overflow-auto divide-y divide-border text-xs">
              {preview.new.map((t, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5"
                >
                  <span className="w-20 shrink-0 text-muted-foreground whitespace-nowrap font-mono">
                    {t.transactionDate}
                  </span>
                  <span className="flex-1 min-w-0 order-3 sm:order-none basis-full sm:basis-auto truncate">
                    {t.description}
                  </span>
                  <span
                    className={cn(
                      "ml-auto sm:ml-0 sm:w-28 text-right shrink-0 whitespace-nowrap font-mono tabular-nums",
                      t.amount >= 0
                        ? "text-status-ok-fg"
                        : "text-status-error-fg",
                    )}
                  >
                    {fmtAmount(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview.duplicates.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setShowDuplicates(!showDuplicates)}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted text-sm font-medium"
          >
            <span>
              Duplicados — se omitirán (
              {preview.duplicates.length.toLocaleString("es-CL")})
            </span>
            {showDuplicates ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showDuplicates && (
            <div className="max-h-72 overflow-auto divide-y divide-border text-xs text-muted-foreground">
              {preview.duplicates.map((t, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5"
                >
                  <span className="w-20 shrink-0 whitespace-nowrap font-mono">
                    {t.transactionDate}
                  </span>
                  <span className="flex-1 min-w-0 order-3 sm:order-none basis-full sm:basis-auto truncate">
                    {t.description}
                  </span>
                  <span className="ml-auto sm:ml-0 sm:w-28 text-right shrink-0 whitespace-nowrap font-mono tabular-nums">
                    {fmtAmount(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
