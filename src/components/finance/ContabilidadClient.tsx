"use client";

import { useCallback, useMemo, useState } from "react";
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
import { EmptyState, DataTable, type DataTableColumn } from "@/components/opai";
import {
  BookText,
  FileSpreadsheet,
  BookOpen,
  Calendar,
  Plus,
  Search,
  Pencil,
  ChevronRight,
  Loader2,
  Lock,
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
  ASSET: { label: "Activo", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LIABILITY: { label: "Pasivo", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  EQUITY: { label: "Patrimonio", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  REVENUE: { label: "Ingreso", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  COST: { label: "Costo", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  EXPENSE: { label: "Gasto", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const JOURNAL_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Borrador", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  POSTED: { label: "Contabilizado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  REVERSED: { label: "Reversado", className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const PERIOD_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Abierto", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
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
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
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
      } else {
        const res = await fetch("/api/finance/accounting/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            type: form.type,
            nature: form.nature,
            parentId: form.parentId && form.parentId !== "__none__" ? form.parentId : null,
            level: parseInt(form.level) || 1,
            acceptsEntries: form.acceptsEntries,
            description: form.description.trim() || null,
            taxCode: form.taxCode.trim() || null,
          }),
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
          icon={<BookText className="h-10 w-10" />}
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
            <DataTable
              compact
              columns={[
                {
                  key: "code",
                  label: "Código",
                  render: (_v, row) => (
                    <span className="font-mono text-xs" style={{ paddingLeft: `${(row.level - 1) * 16}px` }}>
                      {row.code}
                    </span>
                  ),
                },
                { key: "name", label: "Nombre" },
                {
                  key: "type",
                  label: "Tipo",
                  render: (_v, row) => {
                    const typeCfg = ACCOUNT_TYPE_CONFIG[row.type] ?? { label: row.type, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", typeCfg.className)}>
                        {typeCfg.label}
                      </Badge>
                    );
                  },
                },
                { key: "level", label: "Nivel", className: "text-center", render: (v) => <span className="text-muted-foreground">{v}</span> },
                {
                  key: "acceptsEntries",
                  label: "Movimientos",
                  className: "text-center",
                  render: (v) =>
                    v ? (
                      <span className="text-emerald-400 text-xs">Sí</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    ),
                },
                {
                  key: "isActive",
                  label: "Estado",
                  render: (v) => (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        v
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                      )}
                    >
                      {v ? "Activa" : "Inactiva"}
                    </Badge>
                  ),
                },
                ...(canManage
                  ? [{
                      key: "_actions",
                      label: "",
                      render: (_v: any, row: any) => (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ),
                    }]
                  : []),
              ] as DataTableColumn[]}
              data={filtered}
              emptyMessage="Sin cuentas"
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
                          {a.acceptsEntries && <span className="text-emerald-400">Acepta movimientos</span>}
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Modifica los datos de la cuenta contable."
                : "Completa los campos para agregar una nueva cuenta al plan contable."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  disabled={!!editingId}
                  placeholder="1.1.01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
            </div>
            {!editingId && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tipo *</Label>
                    <Select value={form.type} onValueChange={(v) => setField("type", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACCOUNT_TYPE_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Naturaleza *</Label>
                    <Select value={form.nature} onValueChange={(v) => setField("nature", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">Débito</SelectItem>
                        <SelectItem value="CREDIT">Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Cuenta padre</Label>
                    <Select value={form.parentId} onValueChange={(v) => setField("parentId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Sin padre" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin padre (raíz)</SelectItem>
                        {accounts
                          .filter((a) => !a.acceptsEntries)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} - {a.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nivel</Label>
                    <Input
                      type="number" min={1} max={10}
                      value={form.level}
                      onChange={(e) => setField("level", e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <Label>Código tributario</Label>
                <Input
                  value={form.taxCode}
                  onChange={(e) => setField("taxCode", e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="acc-entries"
                checked={form.acceptsEntries as boolean}
                onChange={(e) => setField("acceptsEntries", e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="acc-entries">Acepta movimientos</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? "Guardar" : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          icon={<FileSpreadsheet className="h-10 w-10" />}
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
            <DataTable
              compact
              columns={[
                {
                  key: "number",
                  label: "N°",
                  render: (v) => <span className="font-mono text-xs">{v}</span>,
                },
                {
                  key: "date",
                  label: "Fecha",
                  render: (v) => (
                    <span className="text-muted-foreground">
                      {format(new Date(v), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  key: "description",
                  label: "Descripción",
                  render: (_v, row) => (
                    <div>
                      <div>{row.description}</div>
                      {row.reference && (
                        <div className="text-xs text-muted-foreground">Ref: {row.reference}</div>
                      )}
                    </div>
                  ),
                },
                {
                  key: "totalDebit",
                  label: "Debe",
                  className: "text-right",
                  render: (v) => <span className="font-mono text-xs">{fmtCLP.format(v)}</span>,
                },
                {
                  key: "totalCredit",
                  label: "Haber",
                  className: "text-right",
                  render: (v) => <span className="font-mono text-xs">{fmtCLP.format(v)}</span>,
                },
                {
                  key: "status",
                  label: "Estado",
                  render: (v) => {
                    const stCfg = JOURNAL_STATUS_CONFIG[v] ?? { label: v, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
              ]}
              data={filtered}
              emptyMessage="Sin asientos"
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
        <CardContent className="pt-4 pb-4">
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
          icon={<BookOpen className="h-10 w-10" />}
          title="Sin movimientos"
          description="Seleccione una cuenta y rango de fechas para ver el libro mayor."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable
              compact
              columns={[
                {
                  key: "date",
                  label: "Fecha",
                  render: (v) => (
                    <span className="text-muted-foreground">
                      {format(new Date(v), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  key: "journalEntryNumber",
                  label: "N° Asiento",
                  render: (v) => <span className="font-mono text-xs">#{v}</span>,
                },
                { key: "description", label: "Descripción" },
                {
                  key: "debit",
                  label: "Debe",
                  className: "text-right",
                  render: (v) => (
                    <span className="font-mono text-xs">{v > 0 ? fmtCLP.format(v) : ""}</span>
                  ),
                },
                {
                  key: "credit",
                  label: "Haber",
                  className: "text-right",
                  render: (v) => (
                    <span className="font-mono text-xs">{v > 0 ? fmtCLP.format(v) : ""}</span>
                  ),
                },
                {
                  key: "balance",
                  label: "Saldo",
                  className: "text-right",
                  render: (v) => (
                    <span className={cn("font-mono text-xs font-medium", v < 0 ? "text-red-400" : "")}>
                      {fmtCLP.format(v)}
                    </span>
                  ),
                },
              ]}
              data={ledgerData}
              emptyMessage="Sin movimientos"
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
                    <span className={cn("font-mono font-medium", entry.balance < 0 ? "text-red-400" : "")}>
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

      {periods.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10 text-white" />}
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
            <DataTable
              compact
              columns={[
                {
                  key: "month",
                  label: "Período",
                  render: (_v, row) => (
                    <span className="font-medium">{MONTH_NAMES[row.month - 1]} {row.year}</span>
                  ),
                },
                {
                  key: "startDate",
                  label: "Inicio",
                  render: (v) => (
                    <span className="text-muted-foreground">{format(new Date(v), "dd/MM/yyyy")}</span>
                  ),
                },
                {
                  key: "endDate",
                  label: "Fin",
                  render: (v) => (
                    <span className="text-muted-foreground">{format(new Date(v), "dd/MM/yyyy")}</span>
                  ),
                },
                {
                  key: "status",
                  label: "Estado",
                  render: (v) => {
                    const stCfg = PERIOD_STATUS_CONFIG[v] ?? { label: v, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
                ...(canManage
                  ? [{
                      key: "_actions",
                      label: "",
                      render: (_v: any, row: any) =>
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
                    }]
                  : []),
              ] as DataTableColumn[]}
              data={periods}
              emptyMessage="Sin períodos"
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
