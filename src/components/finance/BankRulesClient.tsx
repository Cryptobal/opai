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
import { BankBuiltinAutomatchRulesPanel } from "./BankBuiltinAutomatchRulesPanel";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  PlayCircle,
  Settings2,
  AlertCircle,
  RefreshCw,
  BookMarked,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountPlanCombobox } from "./AccountPlanCombobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runningHistorical, setRunningHistorical] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  /** Lista editable vs motor fijo (documentación de autoconciliación). */
  const [rulesPanel, setRulesPanel] = useState<"editable" | "builtin">(
    "editable",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/finance/banking/automatch-rules", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setRules(json.data ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar reglas";
      setLoadError(msg);
      toast.error(msg);
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

  const handleRunHistorical = async () => {
    if (
      !confirm(
        "¿Conciliar histórico? Se evaluarán los movimientos UNMATCHED contra DTEs pendientes (match por monto + RUT) y, como fallback, contra las reglas activas. Los matches quedan como conciliados o reconocidos según corresponda."
      )
    ) {
      return;
    }
    setRunningHistorical(true);
    try {
      const res = await fetch(
        "/api/finance/banking/automatch-rules/run-historical",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeSuggested: true }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      const d = json.data ?? {};
      toast.success(
        `Procesados ${(d.scanned ?? 0).toLocaleString("es-CL")} mov: ` +
          `${d.matched ?? 0} conciliados · ${d.ruleMatched ?? 0} reconocidos por regla`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error en re-evaluación");
    } finally {
      setRunningHistorical(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={rulesPanel === "editable" ? "default" : "outline"}
            className={cn(
              "h-9",
              rulesPanel === "builtin" &&
                "border-ds-border-default text-muted-foreground",
            )}
            onClick={() => setRulesPanel("editable")}
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Mis reglas (editables)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rulesPanel === "builtin" ? "default" : "outline"}
            className={cn(
              "h-9",
              rulesPanel === "editable" &&
                "border-ds-border-default text-muted-foreground",
            )}
            onClick={() => setRulesPanel("builtin")}
          >
            <BookMarked className="h-3.5 w-3.5 mr-1.5" />
            Motor autoconciliación (fijo)
          </Button>
        </div>
        {rulesPanel === "editable" ? (
          <div className="flex items-center gap-3 flex-wrap sm:justify-end">
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              {rules.length} regla{rules.length === 1 ? "" : "s"} ·{" "}
              <span className="text-status-ok-fg font-medium">
                {rules.filter((r) => r.enabled).length} activas
              </span>
            </p>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunHistorical}
                  disabled={runningHistorical}
                >
                  {runningHistorical ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-1.5" />
                  )}
                  Conciliar histórico
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nueva regla
                </Button>
              </div>
            )}
          </div>
        ) : (
          canManage && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunHistorical}
                disabled={runningHistorical}
              >
                {runningHistorical ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-1.5" />
                )}
                Conciliar histórico
              </Button>
            </div>
          )
        )}
      </div>

      {rulesPanel === "builtin" ? (
        <BankBuiltinAutomatchRulesPanel />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <Card className="border-status-danger-border bg-status-danger-soft">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-status-danger-fg flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-status-danger-fg">
                No pudimos cargar tus reglas
              </p>
              <p className="text-xs text-status-danger-fg/80 mt-1">
                {loadError}. Tus reglas siguen guardadas — sólo falló la lectura.
                Intenta recargar.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="Sin reglas configuradas"
          description="Las reglas aplican automáticamente al importar cartola: por ejemplo categorizar todo lo que diga 'PAGO ENEL' a la cuenta contable de Servicios Básicos. El orden DTE → turnos extra → estas reglas está descrito en «Motor autoconciliación (fijo)»."
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

      {rulesPanel === "editable" && canManage && (
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
  const [showPriorityHelp, setShowPriorityHelp] = useState(false);
  // Live preview result count + total (alimentado por LivePreviewPanel).
  const [livePreview, setLivePreview] = useState<{
    count: number;
    total: number;
  } | null>(null);
  // Post-creación: si la regla recién creada matchearía histórico, ofrecer
  // correrla con 3 opciones (solo futuros / sugerir / aplicar directo).
  const [postCreatePrompt, setPostCreatePrompt] = useState<{
    ruleId: string;
    ruleName: string;
    matchCount: number;
  } | null>(null);
  const [runningPostCreate, setRunningPostCreate] = useState(false);

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
      setLivePreview(null);
      setPostCreatePrompt(null);
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
      const hr = json.data?.historicalResult as
        | { suggested: number; autoMatched: number }
        | null
        | undefined;
      if (hr && (hr.suggested > 0 || hr.autoMatched > 0)) {
        const parts = [`${hr.suggested} en "Reconocidos"`];
        if (hr.autoMatched > 0) parts.push(`${hr.autoMatched} auto-conciliadas`);
        toast.success(
          `${rule ? "Regla actualizada" : "Regla creada"} · ${parts.join(" · ")}`,
        );
      } else {
        toast.success(rule ? "Regla actualizada" : "Regla creada");
      }

      // Post-creación: si era CREATE (no EDIT) y la regla matchearía algo
      // en histórico, ofrecer ejecutarla.
      if (!rule && livePreview && livePreview.count > 0) {
        setPostCreatePrompt({
          ruleId: json.data.id,
          ruleName: json.data.name,
          matchCount: livePreview.count,
        });
        // No cerramos el sheet todavía.
      } else {
        onSaved(json.data);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const runHistoricalFromPrompt = async (forceApply: boolean) => {
    if (!postCreatePrompt) return;
    setRunningPostCreate(true);
    try {
      if (forceApply) {
        // Forzar requiresReview=false antes de correr histórico.
        await fetch(
          `/api/finance/banking/automatch-rules/${postCreatePrompt.ruleId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: { ...draft.action, requiresReview: false },
            }),
          },
        );
      }
      const res = await fetch(
        "/api/finance/banking/automatch-rules/run-historical",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruleId: postCreatePrompt.ruleId,
            includeSuggested: false,
          }),
        },
      );
      const json = await res.json();
      if (res.ok && json.success) {
        const d = json.data;
        toast.success(
          `${(d.ruleMatched ?? 0) + (d.matched ?? 0)} movimientos procesados.`,
        );
      }
      // Cerrar prompt y avanzar — devolvemos un Rule-ish con id.
      const ruleId = postCreatePrompt.ruleId;
      setPostCreatePrompt(null);
      onSaved({
        id: ruleId,
        name: draft.name,
        enabled: draft.enabled,
        priority: draft.priority,
        appliesTo: draft.appliesTo,
        conditions: draft.conditions,
        action: forceApply
          ? { ...draft.action, requiresReview: false }
          : draft.action,
        timesMatched: 0,
        lastMatchedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al correr histórico");
    } finally {
      setRunningPostCreate(false);
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 0px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0px)",
        }}
      >
        <SheetHeader className="px-6 pt-5 pb-3 border-b border-border bg-background shrink-0">
          <SheetTitle className="pr-12">{rule ? "Editar regla" : "Nueva regla"}</SheetTitle>
          <SheetDescription>
            Las reglas aplican al importar cartola y desde la conciliación
            manual. Categorizan automáticamente o sugieren para revisar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="rule-prio">Prioridad</Label>
                  <button
                    type="button"
                    className="text-[12px] text-ds-text-3 hover:text-ds-text-2 inline-flex items-center gap-1"
                    onClick={() => setShowPriorityHelp((s) => !s)}
                  >
                    <HelpCircle className="h-3 w-3" />
                    ¿Qué es?
                  </button>
                </div>
                <Input
                  id="rule-prio"
                  type="number"
                  inputMode="numeric"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priority: Number(e.target.value) || 100 }))
                  }
                  min={0}
                  max={9999}
                  className="h-10 sm:h-9 font-mono"
                />
                {showPriorityHelp && (
                  <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-2 text-[12px] text-ds-text-2 mt-1.5">
                    <p>
                      Cuando varias reglas matchean el mismo movimiento, gana la de
                      prioridad <b>menor</b>. Default <span className="font-mono">100</span>.
                    </p>
                    <p className="text-ds-text-3 mt-1">
                      Usá números bajos (10, 20) para reglas más específicas que deban
                      ganar sobre las genéricas.
                    </p>
                  </div>
                )}
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
              <AccountPlanCombobox
                items={groupAccounts(accountPlans).flatMap((g) => g.items)}
                value={draft.action.accountPlanId ?? ""}
                onChange={(id) =>
                  setDraft((d) => ({
                    ...d,
                    action: { ...d.action, accountPlanId: id || null },
                  }))
                }
                placeholder="Buscar por código o nombre…"
                emptyLabel="Seleccionar cuenta"
              />
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

          {/* Bloque 4: Preview en vivo (debounce) */}
          <LivePreviewPanel
            draft={draft}
            onPreviewMatchCount={(count, total) =>
              setLivePreview({ count, total })
            }
          />

        </div>

        {/* Footer sticky en el bottom — accesible con el pulgar en mobile */}
        <div className="border-t border-border bg-background px-6 py-3 flex items-center gap-2 flex-wrap">
          <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-initial">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            <Layers className="h-4 w-4 mr-1.5" />
            {rule ? "Guardar cambios" : "Crear regla"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1 sm:flex-initial"
          >
            Cancelar
          </Button>
        </div>
        {postCreatePrompt && (
          <Dialog
            open={true}
            onOpenChange={(v) => {
              if (!v && !runningPostCreate) setPostCreatePrompt(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>¿Aplicar también a movimientos pasados?</DialogTitle>
                <DialogDescription>
                  La regla "{postCreatePrompt.ruleName}" matchearía aproximadamente{" "}
                  <b>{postCreatePrompt.matchCount}</b> movimiento
                  {postCreatePrompt.matchCount === 1 ? "" : "s"} de los últimos 30 días.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-[13px]">
                <p className="text-ds-text-2">Tres opciones:</p>
                <ul className="space-y-2 text-ds-text-3">
                  <li className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-2.5">
                    <b className="text-ds-text-1">Solo futuros:</b> la regla aplica desde ahora, no toca histórico.
                  </li>
                  <li className="rounded-md border border-status-warn-border bg-status-warn-soft p-2.5">
                    <b className="text-status-warn-fg">Sugerir en históricos:</b> los movimientos pasados quedan en "Reconocidos" para que vos revises y autorices uno por uno.
                  </li>
                  <li className="rounded-md border border-status-ok-border bg-status-ok-soft p-2.5">
                    <b className="text-status-ok-fg">Aplicar directamente:</b> conciliar todos los movimientos pasados automáticamente. Solo si confías 100% en los criterios.
                  </li>
                </ul>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const ruleId = postCreatePrompt.ruleId;
                    setPostCreatePrompt(null);
                    onSaved({
                      id: ruleId,
                      name: draft.name,
                      enabled: draft.enabled,
                      priority: draft.priority,
                      appliesTo: draft.appliesTo,
                      conditions: draft.conditions,
                      action: draft.action,
                      timesMatched: 0,
                      lastMatchedAt: null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  }}
                  disabled={runningPostCreate}
                  className="h-10 sm:h-9 w-full sm:w-auto"
                >
                  Solo futuros
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runHistoricalFromPrompt(false)}
                  disabled={runningPostCreate}
                  className="h-10 sm:h-9 w-full sm:w-auto"
                >
                  {runningPostCreate && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Sugerir
                </Button>
                <Button
                  onClick={() => runHistoricalFromPrompt(true)}
                  disabled={runningPostCreate}
                  className="h-10 sm:h-9 w-full sm:w-auto"
                >
                  {runningPostCreate && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Aplicar directo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Live Preview Panel ───

interface LivePreviewProps {
  draft: typeof EMPTY_RULE;
  onPreviewMatchCount: (count: number, total: number) => void;
}

/**
 * Cuenta matches en últimos 30 días con debounce de 800ms cada vez que el
 * draft cambia. Reemplaza al botón "Probar regla" — el feedback es continuo.
 */
function LivePreviewPanel({ draft, onPreviewMatchCount }: LivePreviewProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    totalScanned: number;
    wouldMatch: number;
    sample: { amount: number; description: string; reference: string | null }[];
  } | null>(null);

  useEffect(() => {
    if (draft.conditions.items.length === 0) {
      setResult(null);
      return;
    }
    const someValid = draft.conditions.items.some((c) => {
      if (c.operator === "IS_EMPTY") return true;
      if (c.operator === "AMOUNT_BETWEEN") {
        const v = c.value as { min?: number; max?: number } | null;
        return v?.min != null || v?.max != null;
      }
      return c.value !== null && c.value !== undefined && c.value !== "";
    });
    if (!someValid) {
      setResult(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          "/api/finance/banking/automatch-rules/preview",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appliesTo: draft.appliesTo,
              conditions: draft.conditions,
              daysBack: 30,
            }),
          },
        );
        const json = await res.json();
        if (res.ok && json.success) {
          setResult(json.data);
          onPreviewMatchCount(json.data.wouldMatch, json.data.totalScanned);
        }
      } catch {
        /* silencioso */
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [draft, onPreviewMatchCount]);

  return (
    <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12.5px]">
      <div className="flex items-center gap-2 mb-1.5">
        <PlayCircle className="h-3.5 w-3.5 text-ds-text-3" />
        <span className="font-medium text-ds-text-2">
          Vista previa últimos 30 días
        </span>
        {loading && (
          <Loader2 className="h-3 w-3 animate-spin text-ds-text-3" />
        )}
      </div>
      {result ? (
        <>
          <p className="text-ds-text-2">
            Matchearía{" "}
            <span className="font-semibold text-status-ok-fg font-mono tabular-nums">
              {result.wouldMatch}
            </span>{" "}
            de{" "}
            <span className="font-mono tabular-nums">
              {result.totalScanned.toLocaleString("es-CL")}
            </span>{" "}
            movimientos.
          </p>
          {result.sample.length > 0 && (
            <ul className="text-[12px] text-ds-text-3 space-y-0.5 mt-2">
              {result.sample.slice(0, 3).map((s, i) => (
                <li key={i} className="truncate font-mono">
                  · {s.description} · $
                  {Math.abs(s.amount).toLocaleString("es-CL")}
                </li>
              ))}
              {result.sample.length > 3 && (
                <li className="text-ds-text-4">
                  … y {result.sample.length - 3} más
                </li>
              )}
            </ul>
          )}
        </>
      ) : (
        <p className="text-ds-text-3">
          Completá un criterio para ver cuántos movimientos matchearía.
        </p>
      )}
    </div>
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
