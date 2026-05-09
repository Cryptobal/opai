"use client";

/**
 * Pestaña "Reglas auto-match" — lista de reglas configurables al estilo Buk.
 *
 * Cada regla aplica a depósitos/retiros/ambos, define criterios sobre
 * descripción/referencia/monto/RUT y una acción (cuenta contable destino,
 * proveedor, requiresReview). El motor las evalúa al importar cartola y
 * desde el endpoint manual de auto-match.
 */

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/opai-ds";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  PlayCircle,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──

type RuleField =
  | "DESCRIPTION"
  | "REFERENCE"
  | "AMOUNT"
  | "BENEFICIARY_RUT";
type RuleOperator =
  | "CONTAINS"
  | "STARTS_WITH"
  | "EQUALS"
  | "IS_EMPTY"
  | "AMOUNT_BETWEEN"
  | "AMOUNT_GTE"
  | "AMOUNT_LTE"
  | "RUT_MATCHES";

interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value?: string | number | { min?: number; max?: number } | null;
}
interface RuleConditions {
  mode: "ALL" | "ANY";
  items: RuleCondition[];
}
interface RuleAction {
  handlingMode: "RECOGNIZED" | "CATEGORIZED";
  accountPlanId?: string | null;
  supplierId?: string | null;
  counterpartyRut?: string | null;
  requiresReview: boolean;
}
interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  appliesTo: "DEPOSITS" | "WITHDRAWALS" | "BOTH";
  conditions: RuleConditions;
  action: RuleAction;
  timesMatched: number;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
  /** Tipo contable: ASSET, LIABILITY, EQUITY, REVENUE, COST, EXPENSE. */
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

function groupAccounts(
  plans: AccountPlanOption[]
): { type: string; label: string; items: AccountPlanOption[] }[] {
  const buckets = new Map<string, AccountPlanOption[]>();
  for (const p of plans) {
    const t = p.type ?? "OTHER";
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(p);
  }
  const order = [
    "EXPENSE",
    "COST",
    "REVENUE",
    "ASSET",
    "LIABILITY",
    "EQUITY",
    "OTHER",
  ];
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

interface BankRulesClientProps {
  canManage: boolean;
  accountPlans: AccountPlanOption[];
}

const FIELD_LABEL: Record<RuleField, string> = {
  DESCRIPTION: "Descripción",
  REFERENCE: "Referencia",
  AMOUNT: "Monto",
  BENEFICIARY_RUT: "RUT contraparte",
};

const OPERATOR_LABEL: Record<RuleOperator, string> = {
  CONTAINS: "contiene",
  STARTS_WITH: "empieza por",
  EQUALS: "es igual a",
  IS_EMPTY: "está vacío",
  AMOUNT_BETWEEN: "está entre",
  AMOUNT_GTE: "es mayor o igual a",
  AMOUNT_LTE: "es menor o igual a",
  RUT_MATCHES: "es",
};

const SCOPE_LABEL: Record<Rule["appliesTo"], string> = {
  DEPOSITS: "Depósitos",
  WITHDRAWALS: "Retiros",
  BOTH: "Ambos",
};

const SCOPE_CLASS: Record<Rule["appliesTo"], string> = {
  DEPOSITS: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  WITHDRAWALS: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  BOTH: "bg-status-info-soft text-status-info-fg border-status-info-border",
};

// Operadores válidos por campo
const OPERATORS_BY_FIELD: Record<RuleField, RuleOperator[]> = {
  DESCRIPTION: ["CONTAINS", "STARTS_WITH", "EQUALS", "IS_EMPTY"],
  REFERENCE: ["CONTAINS", "STARTS_WITH", "EQUALS", "IS_EMPTY"],
  AMOUNT: ["AMOUNT_GTE", "AMOUNT_LTE", "AMOUNT_BETWEEN", "EQUALS"],
  BENEFICIARY_RUT: ["RUT_MATCHES"],
};

const EMPTY_RULE: Omit<Rule, "id" | "timesMatched" | "lastMatchedAt" | "createdAt" | "updatedAt"> = {
  name: "",
  enabled: true,
  priority: 100,
  appliesTo: "BOTH",
  conditions: { mode: "ANY", items: [{ field: "DESCRIPTION", operator: "CONTAINS", value: "" }] },
  action: {
    handlingMode: "CATEGORIZED",
    accountPlanId: null,
    supplierId: null,
    counterpartyRut: null,
    requiresReview: true,
  },
};

export function BankRulesClient({ canManage, accountPlans }: BankRulesClientProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/banking/automatch-rules");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      setRules(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar reglas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/finance/banking/automatch-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    try {
      const res = await fetch(`/api/finance/banking/automatch-rules/${rule.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Regla eliminada");
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {rules.length} regla{rules.length === 1 ? "" : "s"} ·{" "}
            <span className="text-status-ok-fg font-medium">
              {rules.filter((r) => r.enabled).length} activas
            </span>
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva regla
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="Sin reglas configuradas"
          description="Las reglas aplican automáticamente al importar cartola: por ejemplo categorizar todo lo que diga 'PAGO ENEL' a la cuenta contable de Servicios Básicos."
          action={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Crear primera regla
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={cn(!rule.enabled && "opacity-60")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{rule.name}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", SCOPE_CLASS[rule.appliesTo])}
                      >
                        {SCOPE_LABEL[rule.appliesTo]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Prioridad {rule.priority}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          rule.action.handlingMode === "RECOGNIZED"
                            ? "bg-status-info-soft text-status-info-fg border-status-info-border"
                            : "bg-violet-500/15 text-violet-400 border-violet-500/30"
                        )}
                      >
                        {rule.action.handlingMode === "RECOGNIZED"
                          ? "Reconoce"
                          : "Categoriza"}
                      </Badge>
                      {rule.action.requiresReview && (
                        <Badge variant="outline" className="text-xs bg-status-warn-soft text-status-warn-fg border-status-warn-border">
                          Requiere revisión
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Si{" "}
                      <span className="font-medium">
                        {rule.conditions.mode === "ALL"
                          ? "TODOS"
                          : "AL MENOS UNO"}
                      </span>{" "}
                      de:{" "}
                      {rule.conditions.items.map((c, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          <span className="text-foreground">
                            {FIELD_LABEL[c.field]}
                          </span>{" "}
                          {OPERATOR_LABEL[c.operator]}{" "}
                          {formatValue(c)}
                        </span>
                      ))}
                    </p>
                    {rule.action.accountPlanId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        →{" "}
                        <span className="text-foreground">
                          {accountPlans.find((p) => p.id === rule.action.accountPlanId)
                            ?.code ?? "?"}{" "}
                          {accountPlans.find((p) => p.id === rule.action.accountPlanId)
                            ?.name ?? ""}
                        </span>
                      </p>
                    )}
                    {rule.timesMatched > 0 && (
                      <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                        Matcheada {rule.timesMatched} vez{rule.timesMatched === 1 ? "" : "es"}
                        {rule.lastMatchedAt && (
                          <>
                            {" · última "}
                            {format(new Date(rule.lastMatchedAt), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(rule)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <RuleEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          rule={editing}
          accountPlans={accountPlans}
          onSaved={(saved) => {
            if (editing) {
              setRules((prev) =>
                prev.map((r) => (r.id === saved.id ? saved : r))
              );
            } else {
              setRules((prev) => [saved, ...prev]);
            }
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function formatValue(c: RuleCondition): string {
  if (c.operator === "IS_EMPTY") return "";
  if (c.operator === "AMOUNT_BETWEEN") {
    const v = c.value as { min?: number; max?: number } | null | undefined;
    return `$${v?.min ?? "?"} y $${v?.max ?? "?"}`;
  }
  if (c.operator === "AMOUNT_GTE" || c.operator === "AMOUNT_LTE") {
    return `$${c.value ?? "?"}`;
  }
  return `"${c.value ?? ""}"`;
}

// ─── Editor Sheet ───

interface RuleEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: Rule | null;
  accountPlans: AccountPlanOption[];
  onSaved: (rule: Rule) => void;
}

function RuleEditorSheet({
  open,
  onOpenChange,
  rule,
  accountPlans,
  onSaved,
}: RuleEditorSheetProps) {
  const [draft, setDraft] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    totalScanned: number;
    wouldMatch: number;
    sample: { amount: number; description: string; reference: string | null }[];
  } | null>(null);

  useEffect(() => {
    if (open) {
      if (rule) {
        setDraft({
          name: rule.name,
          enabled: rule.enabled,
          priority: rule.priority,
          appliesTo: rule.appliesTo,
          conditions: rule.conditions,
          action: rule.action,
        });
      } else {
        setDraft(EMPTY_RULE);
      }
      setPreviewResult(null);
    }
  }, [open, rule]);

  const updateCondition = (idx: number, patch: Partial<RuleCondition>) => {
    setDraft((d) => ({
      ...d,
      conditions: {
        ...d.conditions,
        items: d.conditions.items.map((c, i) =>
          i === idx ? { ...c, ...patch } : c
        ),
      },
    }));
  };

  const addCondition = () => {
    setDraft((d) => ({
      ...d,
      conditions: {
        ...d.conditions,
        items: [
          ...d.conditions.items,
          { field: "DESCRIPTION", operator: "CONTAINS", value: "" },
        ],
      },
    }));
  };

  const removeCondition = (idx: number) => {
    setDraft((d) => ({
      ...d,
      conditions: {
        ...d.conditions,
        items: d.conditions.items.filter((_, i) => i !== idx),
      },
    }));
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const res = await fetch("/api/finance/banking/automatch-rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliesTo: draft.appliesTo,
          conditions: draft.conditions,
          daysBack: 30,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setPreviewResult(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al probar");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Asigná un nombre");
      return;
    }
    if (draft.conditions.items.length === 0) {
      toast.error("Agregá al menos un criterio");
      return;
    }
    setSaving(true);
    try {
      const url = rule
        ? `/api/finance/banking/automatch-rules/${rule.id}`
        : "/api/finance/banking/automatch-rules";
      const method = rule ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          enabled: draft.enabled,
          priority: draft.priority,
          appliesTo: draft.appliesTo,
          conditions: draft.conditions,
          action: draft.action,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(rule ? "Regla actualizada" : "Regla creada");
      onSaved(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{rule ? "Editar regla" : "Nueva regla"}</SheetTitle>
          <SheetDescription>
            Las reglas aplican al importar cartola y desde la conciliación
            manual. Categorizan automáticamente o sugieren para revisar.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Bloque 1: Datos básicos */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="rule-name">Nombre *</Label>
                <Input
                  id="rule-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Ej. Pago ENEL"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-prio">Prioridad</Label>
                <Input
                  id="rule-prio"
                  type="number"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priority: Number(e.target.value) || 100 }))
                  }
                  min={0}
                  max={9999}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="flex items-center gap-2">
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
                />
                <span className="text-sm">Habilitada</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Aplicar a:</span>
                <Select
                  value={draft.appliesTo}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      appliesTo: v as Rule["appliesTo"],
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPOSITS">Depósitos</SelectItem>
                    <SelectItem value="WITHDRAWALS">Retiros</SelectItem>
                    <SelectItem value="BOTH">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Bloque 2: Condiciones */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">Criterios</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Cumple:</span>
                <Select
                  value={draft.conditions.mode}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: { ...d.conditions, mode: v as "ALL" | "ANY" },
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="ANY">Al menos uno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {draft.conditions.items.map((c, i) => (
                <ConditionEditor
                  key={i}
                  index={i}
                  condition={c}
                  onChange={(p) => updateCondition(i, p)}
                  onRemove={
                    draft.conditions.items.length > 1
                      ? () => removeCondition(i)
                      : undefined
                  }
                />
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Agregar criterio
            </Button>
          </div>

          {/* Bloque 3: Acción */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Acción</p>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={draft.action.handlingMode}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    action: {
                      ...d.action,
                      handlingMode: v as "RECOGNIZED" | "CATEGORIZED",
                    },
                  }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CATEGORIZED">
                    Categorizar (asignar cuenta contable)
                  </SelectItem>
                  <SelectItem value="RECOGNIZED">
                    Reconocer (vincular a entidad)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta contable</Label>
              <Select
                value={draft.action.accountPlanId ?? ""}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    action: { ...d.action, accountPlanId: v || null },
                  }))
                }
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {groupAccounts(accountPlans).map((g) => (
                    <SelectGroup key={g.type}>
                      <SelectLabel className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                        {g.label}
                      </SelectLabel>
                      {g.items.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code} {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-rut">RUT contraparte (opcional)</Label>
              <Input
                id="rule-rut"
                value={draft.action.counterpartyRut ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    action: {
                      ...d.action,
                      counterpartyRut: e.target.value || null,
                    },
                  }))
                }
                placeholder="Ej. 76.123.456-7"
              />
            </div>
            <Label className="flex items-center gap-2 pt-1">
              <Switch
                checked={draft.action.requiresReview}
                onCheckedChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    action: { ...d.action, requiresReview: v },
                  }))
                }
              />
              <span className="text-sm">
                Requiere revisión manual antes de conciliar
              </span>
            </Label>
          </div>

          {/* Bloque 4: Probar regla */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewing}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-1.5" />
              )}
              Probar contra últimos 30 días
            </Button>
            {previewResult && (
              <div className="rounded-md border border-border bg-card p-3 text-sm space-y-1">
                <p>
                  Habría matcheado{" "}
                  <span className="font-medium text-status-ok-fg">
                    {previewResult.wouldMatch}
                  </span>{" "}
                  de {previewResult.totalScanned.toLocaleString("es-CL")} mov.
                </p>
                {previewResult.sample.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5 mt-2">
                    {previewResult.sample.slice(0, 5).map((s, i) => (
                      <li key={i} className="truncate">
                        · {s.description} ($
                        {Math.abs(s.amount).toLocaleString("es-CL")})
                      </li>
                    ))}
                    {previewResult.sample.length > 5 && (
                      <li>… y {previewResult.sample.length - 5} más</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <Layers className="h-4 w-4 mr-1.5" />
              {rule ? "Guardar cambios" : "Crear regla"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Editor de una condición individual ───

interface ConditionEditorProps {
  index: number;
  condition: RuleCondition;
  onChange: (patch: Partial<RuleCondition>) => void;
  onRemove?: () => void;
}

function ConditionEditor({
  index,
  condition,
  onChange,
  onRemove,
}: ConditionEditorProps) {
  const validOps = OPERATORS_BY_FIELD[condition.field] ?? [];
  const needsValue =
    condition.operator !== "IS_EMPTY" && condition.operator !== "AMOUNT_BETWEEN";
  const isAmountBetween = condition.operator === "AMOUNT_BETWEEN";
  const isAmount =
    condition.operator === "AMOUNT_GTE" ||
    condition.operator === "AMOUNT_LTE" ||
    (condition.operator === "EQUALS" && condition.field === "AMOUNT");

  return (
    <div className="rounded-md border border-border bg-card p-2.5 sm:p-0 sm:bg-transparent sm:border-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-start space-y-2 sm:space-y-0">
      <div className="flex items-center justify-between sm:col-span-1 sm:pt-2">
        <span className="text-xs text-muted-foreground font-mono">
          Criterio {index + 1}
        </span>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden h-7 w-7 p-0"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>
      <div className="sm:col-span-3">
        <Select
          value={condition.field}
          onValueChange={(v) => {
            const newField = v as RuleField;
            const validOpsForNew = OPERATORS_BY_FIELD[newField] ?? [];
            // Si el operador actual no es válido para el nuevo field, ajustar.
            const newOp = validOpsForNew.includes(condition.operator)
              ? condition.operator
              : validOpsForNew[0];
            onChange({ field: newField, operator: newOp, value: "" });
          }}
        >
          <SelectTrigger className="h-10 sm:h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FIELD_LABEL) as RuleField[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FIELD_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-3">
        <Select
          value={condition.operator}
          onValueChange={(v) => onChange({ operator: v as RuleOperator })}
        >
          <SelectTrigger className="h-10 sm:h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {validOps.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABEL[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-4">
        {needsValue && (
          <Input
            className="h-10 sm:h-9 text-sm"
            type={isAmount ? "number" : "text"}
            value={
              typeof condition.value === "string" ||
              typeof condition.value === "number"
                ? String(condition.value)
                : ""
            }
            onChange={(e) =>
              onChange({
                value: isAmount ? Number(e.target.value) : e.target.value,
              })
            }
            placeholder={
              condition.operator === "RUT_MATCHES"
                ? "Ej. 76.123.456-7"
                : "valor"
            }
          />
        )}
        {isAmountBetween && (
          <div className="flex items-center gap-1">
            <Input
              className="h-10 sm:h-9 text-sm"
              type="number"
              placeholder="min"
              value={
                (condition.value as { min?: number; max?: number } | undefined)
                  ?.min ?? ""
              }
              onChange={(e) =>
                onChange({
                  value: {
                    ...(condition.value as object),
                    min: Number(e.target.value),
                  },
                })
              }
            />
            <span className="text-xs text-muted-foreground">y</span>
            <Input
              className="h-10 sm:h-9 text-sm"
              type="number"
              placeholder="max"
              value={
                (condition.value as { min?: number; max?: number } | undefined)
                  ?.max ?? ""
              }
              onChange={(e) =>
                onChange({
                  value: {
                    ...(condition.value as object),
                    max: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        )}
      </div>
      <div className="hidden sm:flex sm:col-span-1 sm:justify-end sm:pt-1">
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
