"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SourceTx {
  id: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface RuleCondition {
  field: string;
  operator: string;
  value?: string | number | { min?: number; max?: number } | null;
}

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  appliesTo: "DEPOSITS" | "WITHDRAWALS" | "BOTH";
  conditions: { mode: "ALL" | "ANY"; items: RuleCondition[] };
  action: unknown;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTx: SourceTx;
  detectedRut: string | null;
  /** Si el usuario elige crear regla nueva ante el aviso ALL+varias. */
  onRequestCreateNew: () => void;
  onUpdated: (ruleId: string, ruleName: string) => void;
}

function suggestKeyword(description: string): string {
  const STOP = new Set([
    "TRANSF",
    "TRANSFERENCIA",
    "INTERNET",
    "BANCO",
    "PAGO",
    "DE",
    "DEL",
    "EL",
    "LA",
    "POR",
    "CON",
    "PARA",
    "LOS",
    "LAS",
    "UNA",
    "UN",
  ]);
  const tokens = description
    .toUpperCase()
    .split(/\s+|\/|-|\./)
    .filter((t) => t.length > 3)
    .filter((t) => /^[A-ZÁÉÍÓÚÑ]+$/.test(t))
    .filter((t) => !STOP.has(t));
  return tokens[0] ?? "";
}

function formatCondition(c: RuleCondition): string {
  const field =
    c.field === "DESCRIPTION"
      ? "Descripción"
      : c.field === "REFERENCE"
        ? "Referencia"
        : c.field === "AMOUNT"
          ? "Monto"
          : c.field === "BENEFICIARY_RUT"
            ? "RUT"
            : c.field;
  const op =
    c.operator === "CONTAINS"
      ? "contiene"
      : c.operator === "STARTS_WITH"
        ? "empieza con"
        : c.operator === "EQUALS"
          ? "es"
          : c.operator === "IS_EMPTY"
            ? "está vacío"
            : c.operator === "RUT_MATCHES"
              ? "es"
              : c.operator;
  if (c.operator === "IS_EMPTY") return `${field} ${op}`;
  if (c.operator === "AMOUNT_BETWEEN" && c.value && typeof c.value === "object") {
    const v = c.value as { min?: number; max?: number };
    return `${field} entre ${v.min ?? "?"} y ${v.max ?? "?"}`;
  }
  return `${field} ${op} «${String(c.value ?? "")}»`;
}

/**
 * Agrega una condición derivada del movimiento a una regla existente
 * compatible por signo. Si la regla está en mode ALL con varias
 * condiciones, advierte (agregar una más la vuelve más restrictiva) y
 * ofrece crear una regla nueva.
 */
export function AddToExistingRuleModal({
  open,
  onOpenChange,
  sourceTx,
  detectedRut,
  onRequestCreateNew,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [conditionKind, setConditionKind] = useState<"DESCRIPTION" | "RUT">(
    detectedRut ? "RUT" : "DESCRIPTION",
  );
  const [descriptionValue, setDescriptionValue] = useState("");
  const [rutValue, setRutValue] = useState(detectedRut ?? "");
  const [allMultiAck, setAllMultiAck] = useState(false);

  const appliesNeeded: "DEPOSITS" | "WITHDRAWALS" =
    sourceTx.amount > 0 ? "DEPOSITS" : "WITHDRAWALS";

  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setAllMultiAck(false);
    setConditionKind(detectedRut ? "RUT" : "DESCRIPTION");
    setDescriptionValue(suggestKeyword(sourceTx.description));
    setRutValue(detectedRut ?? "");
    setLoading(true);
    fetch("/api/finance/banking/automatch-rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const list = (json?.data ?? []) as RuleRow[];
        const compatible = list.filter(
          (r) =>
            r.enabled &&
            (r.appliesTo === "BOTH" || r.appliesTo === appliesNeeded),
        );
        setRules(compatible);
      })
      .catch(() => {
        toast.error("No se pudieron cargar las reglas");
        setRules([]);
      })
      .finally(() => setLoading(false));
  }, [open, appliesNeeded, detectedRut, sourceTx.description]);

  const selected = useMemo(
    () => rules.find((r) => r.id === selectedId) ?? null,
    [rules, selectedId],
  );

  const isAllMulti =
    !!selected &&
    selected.conditions.mode === "ALL" &&
    selected.conditions.items.length > 1;

  const newCondition = useMemo((): RuleCondition | null => {
    if (conditionKind === "RUT") {
      const v = rutValue.trim();
      if (!v) return null;
      return {
        field: "BENEFICIARY_RUT",
        operator: "RUT_MATCHES",
        value: v,
      };
    }
    const v = descriptionValue.trim();
    if (!v) return null;
    return {
      field: "DESCRIPTION",
      operator: "CONTAINS",
      value: v,
    };
  }, [conditionKind, descriptionValue, rutValue]);

  const handleSave = async () => {
    if (!selected || !newCondition) {
      toast.error("Elegí una regla y completá la condición.");
      return;
    }
    if (isAllMulti && !allMultiAck) {
      toast.error(
        "Esta regla exige todos los criterios. Confirmá o creá una regla nueva.",
      );
      return;
    }

    const nextMode: "ALL" | "ANY" =
      selected.conditions.mode === "ALL" &&
      selected.conditions.items.length === 1
        ? "ANY"
        : selected.conditions.mode;

    const nextItems = [...selected.conditions.items, newCondition];

    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/banking/automatch-rules/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditions: { mode: nextMode, items: nextItems },
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo actualizar la regla");
      }
      onUpdated(selected.id, selected.name);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[18px] leading-tight">
            Agregar a una regla existente
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Se agregará una condición derivada de este movimiento (
            {appliesNeeded === "DEPOSITS" ? "ingreso" : "egreso"}).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12px] space-y-1">
          <p className="font-medium text-ds-text-1 truncate">
            {sourceTx.description}
          </p>
          <p className="text-ds-text-3 font-mono tabular-nums">
            ${Math.abs(sourceTx.amount).toLocaleString("es-CL")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Regla</Label>
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-ds-text-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando reglas…
            </div>
          ) : rules.length === 0 ? (
            <p className="text-[13px] text-ds-text-3 py-2">
              No hay reglas habilitadas compatibles con este signo. Creá una
              nueva.
            </p>
          ) : (
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Elegí una regla…" />
              </SelectTrigger>
              <SelectContent>
                {rules.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    <span className="text-ds-text-4">
                      {" "}
                      · {r.conditions.mode} · {r.conditions.items.length}{" "}
                      criterio
                      {r.conditions.items.length === 1 ? "" : "s"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selected && (
          <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 space-y-1.5">
            <p className="text-[12px] uppercase tracking-wide text-ds-text-4 font-mono">
              Criterios actuales ({selected.conditions.mode})
            </p>
            <ul className="text-[12.5px] text-ds-text-2 space-y-0.5">
              {selected.conditions.items.map((c, i) => (
                <li key={i} className="truncate">
                  · {formatCondition(c)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <Label>Nueva condición</Label>
          <Select
            value={conditionKind}
            onValueChange={(v) =>
              setConditionKind(v as "DESCRIPTION" | "RUT")
            }
          >
            <SelectTrigger className="h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DESCRIPTION">
                Descripción contiene
              </SelectItem>
              <SelectItem value="RUT" disabled={!detectedRut && !rutValue}>
                RUT contraparte es
              </SelectItem>
            </SelectContent>
          </Select>
          {conditionKind === "DESCRIPTION" ? (
            <Input
              className="h-10 sm:h-9"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              placeholder="Ej. ENEL · VERCEL"
            />
          ) : (
            <Input
              className="h-10 sm:h-9 font-mono"
              value={rutValue}
              onChange={(e) => setRutValue(e.target.value)}
              placeholder="76.123.456-7"
            />
          )}
        </div>

        {isAllMulti && (
          <div
            className={cn(
              "rounded-md border border-status-warn-border bg-status-warn-soft p-3 space-y-2",
            )}
          >
            <div className="flex items-start gap-2 text-[12.5px] text-status-warn-fg">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Esta regla exige <b>todos</b> los criterios. Agregar uno más la
                vuelve más restrictiva (menos movimientos matchean), no más
                amplia. Suele convenir crear una regla nueva.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  onOpenChange(false);
                  onRequestCreateNew();
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Crear regla nueva
              </Button>
              <label className="flex items-center gap-2 text-[12.5px] text-status-warn-fg cursor-pointer min-h-11">
                <input
                  type="checkbox"
                  checked={allMultiAck}
                  onChange={(e) => setAllMultiAck(e.target.checked)}
                  className="rounded border-ds-border-default"
                />
                Entiendo, agregarla igual
              </label>
            </div>
          </div>
        )}

        {selected &&
          selected.conditions.mode === "ALL" &&
          selected.conditions.items.length === 1 && (
            <p className="text-[12px] text-ds-text-3">
              Al agregar el criterio, el modo pasará a «Al menos uno» para no
              estrechar la regla.
            </p>
          )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-10 sm:h-9 w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={
              saving ||
              !selected ||
              !newCondition ||
              (isAllMulti && !allMultiAck)
            }
            className="h-10 sm:h-9 w-full sm:w-auto"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Agregar condición
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
