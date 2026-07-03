"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import {
  BookText,
  FileSpreadsheet,
  BookOpen,
  Calendar,
  Plus,
  Search,
  Pencil,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Lock,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Factory,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  parentId: string | null;
  level: number;
  acceptsEntries: boolean;
  description: string | null;
  taxCode: string | null;
  isActive: boolean;
}

interface JournalRow {
  id: string;
  number: number;
  date: string;
  description: string;
  reference: string | null;
  status: string;
  sourceType: string;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
  createdAt: string;
}

interface PeriodRow {
  id: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  status: string;
  /** Documentos emitidos sin asiento (solo se calcula para períodos OPEN). */
  orphanCount?: number;
}

interface Props {
  accounts: AccountRow[];
  journalEntries: JournalRow[];
  periods: PeriodRow[];
  canManage: boolean;
}

/* ── Constants ── */

const TABS = [
  { id: "accounts", label: "Plan de Cuentas", icon: BookText },
  { id: "journal", label: "Asientos", icon: FileSpreadsheet },
  { id: "ledger", label: "Libro Mayor", icon: BookOpen },
  { id: "periods", label: "Períodos", icon: Calendar },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  ASSET: { label: "Activo", className: "bg-status-info-soft text-status-info-fg border-status-info-border" },
  LIABILITY: { label: "Pasivo", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  EQUITY: { label: "Patrimonio", className: "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30" },
  REVENUE: { label: "Ingreso", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  COST: { label: "Costo", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  EXPENSE: { label: "Gasto", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
};

/** Tipo → naturaleza por defecto (ecuación contable). Editable como escape hatch. */
const DEFAULT_NATURE_BY_TYPE: Record<string, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  COST: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  REVENUE: "CREDIT",
};

/** Prefijo de código numérico por tipo (convención plan chileno). */
const TYPE_CODE_PREFIX: Record<string, string> = {
  ASSET: "1",
  LIABILITY: "2",
  EQUITY: "3",
  REVENUE: "4",
  COST: "5",
  EXPENSE: "6",
};

/** Metadatos visuales de cada tipo para las cards del paso 1. */
const ACCOUNT_TYPE_CARDS: ReadonlyArray<{
  type: string;
  label: string;
  prefix: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
}> = [
  { type: "ASSET", label: "Activo", prefix: "1.x", description: "Bienes y derechos", icon: Wallet, className: "bg-status-info-soft text-status-info-fg border-status-info-border" },
  { type: "LIABILITY", label: "Pasivo", prefix: "2.x", description: "Obligaciones y deudas", icon: CreditCard, className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  { type: "EQUITY", label: "Patrimonio", prefix: "3.x", description: "Capital y reservas", icon: PiggyBank, className: "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30" },
  { type: "REVENUE", label: "Ingreso", prefix: "4.x", description: "Ventas y otros ingresos", icon: TrendingUp, className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  { type: "COST", label: "Costo", prefix: "5.x", description: "Costos directos de operación", icon: Factory, className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  { type: "EXPENSE", label: "Gasto", prefix: "6.x", description: "Gastos de administración", icon: Receipt, className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
];

const JOURNAL_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Borrador", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  POSTED: { label: "Contabilizado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  REVERSED: { label: "Reversado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
};

const PERIOD_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Abierto", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  CLOSED: { label: "Cerrado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function ContabilidadClient({
  accounts,
  journalEntries,
  periods,
  canManage,
}: Props) {
  const router = useRouter();
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

      {/* Tab content */}
      {activeTab === "accounts" && (
        <AccountsTab accounts={accounts} canManage={canManage} />
      )}
      {activeTab === "journal" && (
        <JournalTab entries={journalEntries} canManage={canManage} />
      )}
      {activeTab === "ledger" && (
        <LedgerTab accounts={accounts.filter((a) => a.acceptsEntries && a.isActive)} />
      )}
      {activeTab === "periods" && (
        <PeriodsTab periods={periods} canManage={canManage} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 1: Plan de Cuentas
   ═══════════════════════════════════════════════ */

function AccountsTab({
  accounts,
  canManage,
}: {
  accounts: AccountRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/finance/accounting/accounts/seed", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al inicializar plan de cuentas");
      }
      toast.success("Plan de cuentas chileno inicializado correctamente");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSeeding(false);
    }
  };

  const EMPTY_FORM = {
    code: "", name: "", type: "ASSET", nature: "DEBIT",
    parentId: "", level: "1", acceptsEntries: true,
    description: "", taxCode: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const setField = useCallback(
    (key: string, value: string | boolean) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a: AccountRow) => {
    setEditingId(a.id);
    setForm({
      code: a.code,
      name: a.name,
      type: a.type,
      nature: a.nature,
      parentId: a.parentId ?? "",
      level: String(a.level),
      acceptsEntries: a.acceptsEntries,
      description: a.description ?? "",
      taxCode: a.taxCode ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingId) return;
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/accounting/accounts/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          acceptsEntries: form.acceptsEntries,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar cuenta");
      }
      toast.success("Cuenta actualizada");
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar código o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {canManage && (
          <div className="flex gap-2">
            {accounts.length === 0 && (
              <Button size="sm" variant="outline" onClick={handleSeed} disabled={seeding}>
                {seeding && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Inicializar Plan CL
              </Button>
            )}
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nueva cuenta
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} cuenta(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookText}
          title="Sin cuentas"
          description="No hay cuentas en el plan contable. Puedes inicializar el plan de cuentas estándar chileno o crear cuentas manualmente."
          action={
            canManage ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSeed} disabled={seeding}>
                  {seeding && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Inicializar Plan CL
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear cuenta
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<AccountRow>
              columns={[
                {
                  id: "code",
                  header: "Código",
                  cell: (row) => (
                    <span className="font-mono text-xs" style={{ paddingLeft: `${(row.level - 1) * 16}px` }}>
                      {row.code}
                    </span>
                  ),
                },
                { id: "name", header: "Nombre", cell: (row) => row.name },
                {
                  id: "type",
                  header: "Tipo",
                  cell: (row) => {
                    const typeCfg = ACCOUNT_TYPE_CONFIG[row.type] ?? { label: row.type, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", typeCfg.className)}>
                        {typeCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "level",
                  header: "Nivel",
                  align: "center",
                  cell: (row) => <span className="text-muted-foreground">{row.level}</span>,
                },
                {
                  id: "acceptsEntries",
                  header: "Movimientos",
                  align: "center",
                  cell: (row) =>
                    row.acceptsEntries ? (
                      <span className="text-status-ok-fg text-xs">Sí</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    ),
                },
                {
                  id: "isActive",
                  header: "Estado",
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
                ...(canManage
                  ? [{
                      id: "_actions",
                      header: "",
                      cell: (row: AccountRow) => (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ),
                    } satisfies DataTableColumn<AccountRow>]
                  : []),
              ]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={BookText} title="Sin cuentas" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((a) => {
              const typeCfg = ACCOUNT_TYPE_CONFIG[a.type] ?? { label: a.type, className: "bg-muted" };
              return (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                          <Badge variant="outline" className={cn("text-[10px]", typeCfg.className)}>
                            {typeCfg.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm" style={{ paddingLeft: `${(a.level - 1) * 8}px` }}>
                          {a.name}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Nivel {a.level}</span>
                          {a.acceptsEntries && <span className="text-status-ok-fg">Acepta movimientos</span>}
                        </div>
                      </div>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
      {editingId ? (
        <EditAccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setField={setField}
          saving={saving}
          onSave={handleSave}
        />
      ) : (
        <NewAccountWizard
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          accounts={accounts}
          saving={saving}
          onCreated={() => {
            setDialogOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Edit dialog (mantiene UI simple, sólo nombre/descripción editables) ── */

function EditAccountDialog({
  open,
  onOpenChange,
  form,
  setField,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { code: string; name: string; description: string; acceptsEntries: boolean | string };
  setField: (key: string, value: string | boolean) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cuenta</DialogTitle>
          <DialogDescription>Modifica los datos de la cuenta contable.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input value={form.code} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={form.description} onChange={(e) => setField("description", e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="acc-entries-edit"
              checked={form.acceptsEntries as boolean}
              onChange={(e) => setField("acceptsEntries", e.target.checked)}
              className="rounded border-border"
            />
            <Label htmlFor="acc-entries-edit">Acepta movimientos</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Wizard de creación de cuenta (3 pasos) ── */

type WizardStep = 1 | 2 | 3;

function NewAccountWizard({
  open,
  onOpenChange,
  accounts,
  saving: savingProp,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: AccountRow[];
  saving: boolean;
  onCreated: () => void;
}) {
  void savingProp;
  const [step, setStep] = useState<WizardStep>(1);
  const [type, setType] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  // null = aún no decidido; "root" = nueva raíz; string = id del padre
  const [parentChoice, setParentChoice] = useState<"root" | string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [acceptsEntries, setAcceptsEntries] = useState(true);
  const [nature, setNature] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [showNatureOverride, setShowNatureOverride] = useState(false);

  const [suggestedLevel, setSuggestedLevel] = useState(1);
  const [suggesting, setSuggesting] = useState(false);
  const [codeWasEdited, setCodeWasEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset al abrir
  const resetAll = useCallback(() => {
    setStep(1);
    setType(null);
    setParentId(null);
    setParentChoice(null);
    setCode("");
    setName("");
    setDescription("");
    setTaxCode("");
    setAcceptsEntries(true);
    setNature("DEBIT");
    setShowNatureOverride(false);
    setSuggestedLevel(1);
    setCodeWasEdited(false);
  }, []);

  // Cuando se elige tipo en step 1, setear naturaleza por defecto.
  const pickType = (t: string) => {
    setType(t);
    setNature(DEFAULT_NATURE_BY_TYPE[t] ?? "DEBIT");
    setShowNatureOverride(false);
    setParentChoice(null);
    setParentId(null);
    setCode("");
    setCodeWasEdited(false);
    setStep(2);
  };

  // Padres elegibles para el tipo (no aceptan movimientos y mismo tipo).
  const eligibleParents = useMemo(() => {
    if (!type) return [];
    return accounts
      .filter((a) => !a.acceptsEntries && a.type === type)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, type]);

  // Cuando se confirma el padre en step 2 → pedir next-code y avanzar a step 3.
  const confirmParentAndAdvance = async (choice: "root" | string) => {
    if (!type) return;
    setParentChoice(choice);
    setParentId(choice === "root" ? null : choice);
    setSuggesting(true);
    try {
      const qs = new URLSearchParams({ type });
      if (choice !== "root") qs.set("parentId", choice);
      const res = await fetch(`/api/finance/accounting/accounts/next-code?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No pude sugerir un código");
      }
      setCode(json.data.code as string);
      setSuggestedLevel(json.data.level as number);
      setCodeWasEdited(false);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error sugiriendo código");
    } finally {
      setSuggesting(false);
    }
  };

  // Detección de colisión / formato extraño del código.
  const codeWarning = useMemo(() => {
    if (!type) return null;
    if (!code.trim()) return null;
    const dup = accounts.find((a) => a.code === code.trim());
    if (dup) return `El código ${code} ya existe (${dup.name}).`;
    if (parentChoice && parentChoice !== "root") {
      const parent = accounts.find((a) => a.id === parentChoice);
      if (parent && !code.startsWith(`${parent.code}.`)) {
        return `El código no respeta el prefijo del padre (${parent.code}.…). Podés guardarlo igual si querés.`;
      }
    } else {
      const prefix = TYPE_CODE_PREFIX[type];
      if (prefix && !code.startsWith(prefix)) {
        return `Por convención, las cuentas de ${ACCOUNT_TYPE_CONFIG[type]?.label ?? type} empiezan con ${prefix}.`;
      }
    }
    return null;
  }, [code, parentChoice, accounts, type]);

  const canSave = !!type && !!name.trim() && !!code.trim() && !saving;

  const handleSave = async () => {
    if (!canSave || !type) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          type,
          nature,
          parentId: parentChoice && parentChoice !== "root" ? parentChoice : null,
          level: suggestedLevel || 1,
          acceptsEntries,
          description: description.trim() || null,
          taxCode: taxCode.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear cuenta");
      }
      toast.success("Cuenta creada");
      resetAll();
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAll();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setStep((s) => Math.max(1, (s - 1) as WizardStep) as WizardStep)}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>Nueva cuenta</DialogTitle>
          </div>
          <WizardStepper current={step} />
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              ¿Qué tipo de cuenta vas a crear? Esto define el prefijo del código y la naturaleza por defecto.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACCOUNT_TYPE_CARDS.map((card) => {
                const Icon = card.icon;
                const isActive = type === card.type;
                return (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => pickType(card.type)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary",
                      isActive ? "ring-2 ring-primary" : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", card.className)}>
                        <Icon className="h-3 w-3 mr-1" />
                        {card.label}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">{card.prefix}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && type && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              ¿Dónde colgamos esta cuenta dentro de{" "}
              <span className="text-foreground font-medium">{ACCOUNT_TYPE_CONFIG[type]?.label}</span>?
            </p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => confirmParentAndAdvance("root")}
                disabled={suggesting}
                className={cn(
                  "w-full rounded-md border p-3 text-left transition-colors",
                  "hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary",
                  parentChoice === "root" ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Plus className="h-3.5 w-3.5 text-primary" />
                  Crear como nueva categoría raíz
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Empieza una nueva familia de cuentas bajo {TYPE_CODE_PREFIX[type]}.x
                </p>
              </button>

              {eligibleParents.length > 0 ? (
                eligibleParents.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => confirmParentAndAdvance(p.id)}
                    disabled={suggesting}
                    className={cn(
                      "w-full rounded-md border p-2.5 text-left transition-colors",
                      "hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary",
                      parentChoice === p.id ? "border-primary bg-primary/5" : "border-border",
                    )}
                    style={{ paddingLeft: `${10 + (p.level - 1) * 16}px` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{p.name}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic px-2 py-1">
                  No hay categorías existentes de este tipo todavía.
                </p>
              )}
            </div>
            {suggesting && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando código…
              </p>
            )}
          </div>
        )}

        {step === 3 && type && (
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted/40 border border-border px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant="outline" className={cn("text-[10px]", ACCOUNT_TYPE_CONFIG[type]?.className)}>
                {ACCOUNT_TYPE_CONFIG[type]?.label}
              </Badge>
              {parentChoice && parentChoice !== "root" ? (
                <span className="text-muted-foreground">
                  bajo{" "}
                  <span className="font-mono">
                    {accounts.find((a) => a.id === parentChoice)?.code}
                  </span>{" "}
                  {accounts.find((a) => a.id === parentChoice)?.name}
                </span>
              ) : (
                <span className="text-muted-foreground">categoría raíz</span>
              )}
              <span className="text-muted-foreground">· nivel {suggestedLevel}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeWasEdited(true);
                  }}
                  className="font-mono"
                />
                {codeWarning ? (
                  <p className="text-[11px] text-status-warn-fg flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{codeWarning}</span>
                  </p>
                ) : codeWasEdited ? null : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-status-ok-fg" />
                    Código sugerido automáticamente
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Personal operativo"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Código tributario</Label>
              <Input
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="acc-entries-new"
                checked={acceptsEntries}
                onChange={(e) => setAcceptsEntries(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="acc-entries-new" className="cursor-pointer">
                Acepta movimientos
                <span className="text-[11px] text-muted-foreground ml-1.5">
                  (desmarcá si esta cuenta va a tener cuentas hijas)
                </span>
              </Label>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span>
                Naturaleza:{" "}
                <span className="text-foreground">{nature === "DEBIT" ? "Débito" : "Crédito"}</span>
              </span>
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => setShowNatureOverride((v) => !v)}
              >
                cambiar
              </button>
              {showNatureOverride && (
                <Select value={nature} onValueChange={(v) => setNature(v as "DEBIT" | "CREDIT")}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Débito</SelectItem>
                    <SelectItem value="CREDIT">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <Button variant="outline" onClick={() => { resetAll(); onOpenChange(false); }} disabled={saving}>
              Cancelar
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={suggesting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Atrás
            </Button>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button onClick={handleSave} disabled={!canSave}>
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Crear cuenta
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardStepper({ current }: { current: WizardStep }) {
  const steps: ReadonlyArray<{ n: WizardStep; label: string }> = [
    { n: 1, label: "Tipo" },
    { n: 2, label: "Ubicación" },
    { n: 3, label: "Datos" },
  ];
  return (
    <div className="flex items-center gap-1.5 pt-1">
      {steps.map((s, i) => {
        const isDone = current > s.n;
        const isActive = current === s.n;
        return (
          <div key={s.n} className="flex items-center gap-1.5">
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                isActive ? "bg-primary" : isDone ? "bg-primary/60" : "bg-muted-foreground/30",
              )}
            />
            <span
              className={cn(
                "text-[11px]",
                isActive ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground/40 text-[11px]">·</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 2: Asientos Contables
   ═══════════════════════════════════════════════ */

function JournalTab({
  entries,
  canManage,
}: {
  entries: JournalRow[];
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    let list = entries;
    if (statusFilter !== "ALL") list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          String(e.number).includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.reference?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar número, descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="DRAFT">Borrador</SelectItem>
              <SelectItem value="POSTED">Contabilizado</SelectItem>
              <SelectItem value="REVERSED">Reversado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Link href="/finanzas/contabilidad/asientos/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo asiento
            </Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} asiento(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Sin asientos"
          description="No hay asientos contables registrados."
          action={
            canManage ? (
              <Link href="/finanzas/contabilidad/asientos/nuevo">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear asiento
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<JournalRow>
              columns={[
                {
                  id: "number",
                  header: "N°",
                  cell: (row) => <span className="font-mono text-xs">{row.number}</span>,
                },
                {
                  id: "date",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground">
                      {format(new Date(row.date), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "description",
                  header: "Descripción",
                  cell: (row) => (
                    <div>
                      <div>{row.description}</div>
                      {row.reference && (
                        <div className="text-xs text-muted-foreground">Ref: {row.reference}</div>
                      )}
                    </div>
                  ),
                },
                {
                  id: "totalDebit",
                  header: "Debe",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.totalDebit),
                },
                {
                  id: "totalCredit",
                  header: "Haber",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.totalCredit),
                },
                {
                  id: "status",
                  header: "Estado",
                  cell: (row) => {
                    const stCfg = JOURNAL_STATUS_CONFIG[row.status] ?? { label: row.status, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
              ]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={FileSpreadsheet} title="Sin asientos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((e) => {
              const stCfg = JOURNAL_STATUS_CONFIG[e.status] ?? { label: e.status, className: "bg-muted" };
              return (
                <Card key={e.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">#{e.number}</span>
                          <Badge variant="outline" className={cn("text-[10px]", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{e.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(e.date), "dd MMM yyyy", { locale: es })}
                        </p>
                        <div className="flex gap-4 mt-2 text-xs">
                          <span>Debe: <span className="font-mono">{fmtCLP.format(e.totalDebit)}</span></span>
                          <span>Haber: <span className="font-mono">{fmtCLP.format(e.totalCredit)}</span></span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
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
   Tab 3: Libro Mayor
   ═══════════════════════════════════════════════ */

interface LedgerEntry {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  journalEntryNumber: number;
}

function LedgerTab({ accounts }: { accounts: AccountRow[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!selectedAccountId) {
      toast.error("Seleccione una cuenta");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(
        `/api/finance/accounting/accounts/${selectedAccountId}/ledger?${params.toString()}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al obtener libro mayor");
      }
      const json = await res.json();
      setLedgerData(json.data?.entries ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Cuenta</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-full sm:w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-full sm:w-40"
              />
            </div>
            <Button size="sm" onClick={handleSearch} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {ledgerData.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Sin movimientos"
          description="Seleccione una cuenta y rango de fechas para ver el libro mayor."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<LedgerEntry>
              columns={[
                {
                  id: "date",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground">
                      {format(new Date(row.date), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "journalEntryNumber",
                  header: "N° Asiento",
                  cell: (row) => <span className="font-mono text-xs">#{row.journalEntryNumber}</span>,
                },
                { id: "description", header: "Descripción", cell: (row) => row.description },
                {
                  id: "debit",
                  header: "Debe",
                  align: "right",
                  cell: (row) => (row.debit > 0 ? fmtCLP.format(row.debit) : ""),
                },
                {
                  id: "credit",
                  header: "Haber",
                  align: "right",
                  cell: (row) => (row.credit > 0 ? fmtCLP.format(row.credit) : ""),
                },
                {
                  id: "balance",
                  header: "Saldo",
                  align: "right",
                  cell: (row) => (
                    <span className={cn("font-medium", row.balance < 0 ? "text-status-danger-fg" : "")}>
                      {fmtCLP.format(row.balance)}
                    </span>
                  ),
                },
              ]}
              rows={ledgerData}
              rowKey={(_row, i) => String(i)}
              empty={<EmptyState icon={BookOpen} title="Sin movimientos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {ledgerData.map((entry, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(entry.date), "dd MMM yyyy", { locale: es })}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">#{entry.journalEntryNumber}</span>
                  </div>
                  <p className="text-sm font-medium">{entry.description}</p>
                  <div className="flex justify-between mt-2 text-xs">
                    <div className="space-x-3">
                      {entry.debit > 0 && <span>Debe: <span className="font-mono">{fmtCLP.format(entry.debit)}</span></span>}
                      {entry.credit > 0 && <span>Haber: <span className="font-mono">{fmtCLP.format(entry.credit)}</span></span>}
                    </div>
                    <span className={cn("font-mono font-medium", entry.balance < 0 ? "text-status-danger-fg" : "")}>
                      {fmtCLP.format(entry.balance)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 4: Períodos
   ═══════════════════════════════════════════════ */

function PeriodsTab({
  periods,
  canManage,
}: {
  periods: PeriodRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerateMissing = async (p: PeriodRow) => {
    if (
      !confirm(
        `¿Generar los asientos faltantes de ${MONTH_NAMES[p.month - 1]} ${p.year}? Se creará y contabilizará un asiento por cada documento emitido sin asiento.`,
      )
    )
      return;
    setGenerating(p.id);
    try {
      const res = await fetch("/api/finance/accounting/health/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: p.year, month: p.month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al generar asientos");
      const d = json.data as { created: number; skipped: number; failed: number };
      if (d.failed > 0) {
        toast.warning(
          `${d.created} asiento(s) generado(s), ${d.failed} con error. Revisa el detalle de los documentos.`,
        );
      } else {
        toast.success(`${d.created} asiento(s) generado(s).`);
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setGenerating(null);
    }
  };

  const handleOpenPeriod = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: parseInt(year), month: parseInt(month) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al abrir período");
      }
      toast.success("Período abierto");
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleClosePeriod = async (id: string) => {
    if (!confirm("¿Cerrar este período? No se podrán registrar más movimientos.")) return;
    setClosing(id);
    try {
      const res = await fetch(`/api/finance/accounting/periods/${id}/close`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al cerrar período");
      }
      toast.success("Período cerrado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Abrir período
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{periods.length} período(s)</p>

      {/* Salud del período: documentos emitidos sin asiento por período abierto */}
      {periods
        .filter((p) => p.status === "OPEN" && (p.orphanCount ?? 0) > 0)
        .map((p) => (
          <Card key={`health-${p.id}`} className="border-status-warn-border bg-status-warn-soft">
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-status-warn-fg mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Salud del período · {MONTH_NAMES[p.month - 1]} {p.year}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.orphanCount} documento(s) emitido(s) sin asiento contable.
                    {canManage
                      ? " Genera los asientos faltantes antes de cerrar el período."
                      : ""}
                  </p>
                </div>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerateMissing(p)}
                  disabled={generating === p.id}
                >
                  {generating === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Generar asientos faltantes
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

      {periods.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Sin períodos"
          description="No hay períodos contables abiertos."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Abrir período
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<PeriodRow>
              columns={[
                {
                  id: "month",
                  header: "Período",
                  cell: (row) => (
                    <span className="font-medium">{MONTH_NAMES[row.month - 1]} {row.year}</span>
                  ),
                },
                {
                  id: "startDate",
                  header: "Inicio",
                  cell: (row) => (
                    <span className="text-muted-foreground">{format(new Date(row.startDate), "dd/MM/yyyy")}</span>
                  ),
                },
                {
                  id: "endDate",
                  header: "Fin",
                  cell: (row) => (
                    <span className="text-muted-foreground">{format(new Date(row.endDate), "dd/MM/yyyy")}</span>
                  ),
                },
                {
                  id: "status",
                  header: "Estado",
                  cell: (row) => {
                    const stCfg = PERIOD_STATUS_CONFIG[row.status] ?? { label: row.status, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
                ...(canManage
                  ? [{
                      id: "_actions",
                      header: "",
                      cell: (row: PeriodRow) =>
                        row.status === "OPEN" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClosePeriod(row.id)}
                            disabled={closing === row.id}
                          >
                            {closing === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Lock className="h-3.5 w-3.5 mr-1" />
                            )}
                            Cerrar
                          </Button>
                        ) : null,
                    } satisfies DataTableColumn<PeriodRow>]
                  : []),
              ]}
              rows={periods}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={Calendar} title="Sin períodos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {periods.map((p) => {
              const stCfg = PERIOD_STATUS_CONFIG[p.status] ?? { label: p.status, className: "bg-muted" };
              return (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{MONTH_NAMES[p.month - 1]} {p.year}</p>
                          <Badge variant="outline" className={cn("text-[10px]", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(p.startDate), "dd/MM")} - {format(new Date(p.endDate), "dd/MM/yyyy")}
                        </p>
                      </div>
                      {canManage && p.status === "OPEN" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClosePeriod(p.id)}
                          disabled={closing === p.id}
                        >
                          {closing === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Open Period Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir período contable</DialogTitle>
            <DialogDescription>
              Selecciona el año y mes para abrir un nuevo período contable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-1.5">
                <Label>Año</Label>
                <Input
                  type="number" min={2020} max={2099}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mes</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleOpenPeriod} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Abrir período
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
