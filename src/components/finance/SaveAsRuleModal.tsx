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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

interface SourceTx {
  id: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTx: SourceTx;
  accountPlans: AccountPlanOption[];
  /** Cuenta contable que el usuario ya eligió en Categorizar manual. */
  preselectedAccountId: string | null;
  /** Si hay un RUT detectado en la tx, viene acá para sugerir criterio RUT. */
  detectedRut: string | null;
  onCreated: (ruleId: string, ruleName: string, historicalCount: number) => void;
}

/**
 * Wizard "Guardar como regla" — abre desde el drawer de Conciliar movimiento
 * tab Categorizar manual.
 *
 * Pre-llena criterios analizando la tx actual:
 *   - Palabra clave de la descripción (>3 chars, no numérica) → criterio "contiene"
 *   - RUT detectado → criterio "RUT contraparte es"
 *   - Monto ± 10% → criterio "monto entre"
 *
 * El usuario puede tunear y/o desactivar criterios. Al guardar, se ofrece
 * correr la regla retroactivamente.
 */
export function SaveAsRuleModal({
  open,
  onOpenChange,
  sourceTx,
  accountPlans,
  preselectedAccountId,
  detectedRut,
  onCreated,
}: Props) {
  // Extraer palabra clave: token >3 chars, no numérico, en mayúsculas, sin
  // "TRANSF/INTERNET" genéricos.
  const suggestedKeyword = useMemo(() => {
    const STOP_WORDS = new Set([
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
    const tokens = (sourceTx.description ?? "")
      .toUpperCase()
      .split(/\s+|\/|-|\./)
      .filter((t) => t.length > 3)
      .filter((t) => /^[A-ZÁÉÍÓÚÑ]+$/.test(t))
      .filter((t) => !STOP_WORDS.has(t));
    return tokens[0] ?? "";
  }, [sourceTx.description]);

  const amountAbs = Math.abs(sourceTx.amount);
  const suggestedMin = Math.max(0, Math.floor(amountAbs * 0.9));
  const suggestedMax = Math.ceil(amountAbs * 1.1);

  const [ruleName, setRuleName] = useState("");
  const [criteriaDescription, setCriteriaDescription] = useState(true);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [criteriaRut, setCriteriaRut] = useState(!!detectedRut);
  const [rutValue, setRutValue] = useState(detectedRut ?? "");
  const [criteriaAmount, setCriteriaAmount] = useState(false);
  const [amountMin, setAmountMin] = useState(suggestedMin);
  const [amountMax, setAmountMax] = useState(suggestedMax);
  const [requiresReview, setRequiresReview] = useState(true);
  const [runHistorical, setRunHistorical] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setRuleName("");
      setCriteriaDescription(true);
      setDescriptionValue(suggestedKeyword);
      setCriteriaRut(!!detectedRut);
      setRutValue(detectedRut ?? "");
      setCriteriaAmount(false);
      setAmountMin(suggestedMin);
      setAmountMax(suggestedMax);
      setRequiresReview(true);
      setRunHistorical(true);
    }
  }, [open, suggestedKeyword, detectedRut, suggestedMin, suggestedMax]);

  const account = accountPlans.find((a) => a.id === preselectedAccountId);
  const appliesTo: "DEPOSITS" | "WITHDRAWALS" =
    sourceTx.amount > 0 ? "DEPOSITS" : "WITHDRAWALS";

  const handleSave = async () => {
    if (!preselectedAccountId) {
      toast.error("Faltó la cuenta contable.");
      return;
    }
    const items: Array<{
      field: string;
      operator: string;
      value: string | number | { min: number; max: number } | null;
    }> = [];
    if (criteriaDescription && descriptionValue.trim()) {
      items.push({
        field: "DESCRIPTION",
        operator: "CONTAINS",
        value: descriptionValue.trim(),
      });
    }
    if (criteriaRut && rutValue.trim()) {
      items.push({
        field: "BENEFICIARY_RUT",
        operator: "RUT_MATCHES",
        value: rutValue.trim(),
      });
    }
    if (criteriaAmount) {
      items.push({
        field: "AMOUNT",
        operator: "AMOUNT_BETWEEN",
        value: { min: amountMin, max: amountMax },
      });
    }
    if (items.length === 0) {
      toast.error("Activá al menos un criterio.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/finance/banking/automatch-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName.trim() || `Auto-${descriptionValue.trim() || "regla"}`,
          enabled: true,
          priority: 100,
          appliesTo,
          conditions: { mode: "ALL", items },
          action: {
            handlingMode: "CATEGORIZED",
            accountPlanId: preselectedAccountId,
            requiresReview,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error ?? "Error al crear regla");

      let historicalCount = 0;
      if (runHistorical) {
        const histRes = await fetch(
          "/api/finance/banking/automatch-rules/run-historical",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleId: json.data.id,
              includeSuggested: false,
            }),
          },
        );
        const histJson = await histRes.json();
        if (histRes.ok && histJson.success) {
          historicalCount =
            (histJson.data?.ruleMatched ?? 0) + (histJson.data?.matched ?? 0);
        }
      }

      onCreated(json.data.id, json.data.name, historicalCount);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar regla");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-[12px] font-mono uppercase tracking-[0.08em]">
              Crear regla a partir de este movimiento
            </span>
          </div>
          <DialogTitle className="text-[18px] leading-tight">
            Reglar movimientos similares automáticamente
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Los próximos movimientos que cumplan los criterios se reconocerán o
            conciliarán según tu elección.
          </DialogDescription>
        </DialogHeader>

        {/* Origen */}
        <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12px] space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-ds-text-3 font-mono text-[12px] uppercase shrink-0 mt-0.5">
              Origen:
            </span>
            <span className="font-medium text-ds-text-1 truncate">
              {sourceTx.description}
            </span>
          </div>
          <div className="flex items-center gap-3 text-ds-text-3 flex-wrap">
            <span>
              Monto:{" "}
              <span className="font-mono tabular-nums">
                ${amountAbs.toLocaleString("es-CL")}
              </span>
            </span>
            <span>·</span>
            <span>{appliesTo === "DEPOSITS" ? "Ingreso" : "Egreso"}</span>
            {detectedRut && (
              <>
                <span>·</span>
                <span>
                  RUT: <span className="font-mono">{detectedRut}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Nombre */}
        <div className="space-y-1.5">
          <Label htmlFor="rule-name">Nombre de la regla (opcional)</Label>
          <Input
            id="rule-name"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            placeholder={`Auto-${descriptionValue.trim() || "regla"}`}
            className="h-10 sm:h-9"
          />
        </div>

        {/* Criterios */}
        <div className="space-y-2.5">
          <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Criterios (al menos uno)
          </Label>

          {/* Descripción */}
          <div
            className={cn(
              "rounded-md border p-3 transition-colors",
              criteriaDescription
                ? "border-primary/40 bg-primary/5"
                : "border-ds-border-subtle bg-ds-surface-2",
            )}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={criteriaDescription}
                onCheckedChange={(v) => setCriteriaDescription(!!v)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">
                  Descripción contiene
                </span>
                <Input
                  className="h-10 sm:h-9 mt-1.5"
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  disabled={!criteriaDescription}
                  placeholder="Ej. ENEL"
                />
              </div>
            </label>
          </div>

          {/* RUT */}
          {detectedRut && (
            <div
              className={cn(
                "rounded-md border p-3 transition-colors",
                criteriaRut
                  ? "border-primary/40 bg-primary/5"
                  : "border-ds-border-subtle bg-ds-surface-2",
              )}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={criteriaRut}
                  onCheckedChange={(v) => setCriteriaRut(!!v)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium">
                    RUT contraparte es
                  </span>
                  <Input
                    className="h-10 sm:h-9 mt-1.5 font-mono"
                    value={rutValue}
                    onChange={(e) => setRutValue(e.target.value)}
                    disabled={!criteriaRut}
                    placeholder="76.123.456-7"
                  />
                </div>
              </label>
            </div>
          )}

          {/* Monto */}
          <div
            className={cn(
              "rounded-md border p-3 transition-colors",
              criteriaAmount
                ? "border-primary/40 bg-primary/5"
                : "border-ds-border-subtle bg-ds-surface-2",
            )}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={criteriaAmount}
                onCheckedChange={(v) => setCriteriaAmount(!!v)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">Monto entre</span>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <Input
                    className="h-10 sm:h-9 font-mono"
                    type="number"
                    value={amountMin}
                    onChange={(e) =>
                      setAmountMin(Number(e.target.value) || 0)
                    }
                    disabled={!criteriaAmount}
                  />
                  <Input
                    className="h-10 sm:h-9 font-mono"
                    type="number"
                    value={amountMax}
                    onChange={(e) =>
                      setAmountMax(Number(e.target.value) || 0)
                    }
                    disabled={!criteriaAmount}
                  />
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Acción */}
        <div className="space-y-2.5">
          <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Acción
          </Label>
          <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12.5px]">
            <span className="text-ds-text-3">Categorizar a:</span>{" "}
            <span className="font-mono font-medium">
              {account?.code ?? "?"}
            </span>{" "}
            {account?.name ?? ""}
          </div>
          <label className="flex items-start gap-2 cursor-pointer text-[12.5px]">
            <Switch
              checked={requiresReview}
              onCheckedChange={setRequiresReview}
              className="mt-0.5"
            />
            <div>
              <span className="font-medium">
                Requiere revisión manual antes de conciliar
              </span>
              <p className="text-[12px] text-ds-text-3 mt-0.5">
                {requiresReview
                  ? "Los movimientos quedarán en \"Reconocidos\" hasta que los autorices."
                  : "Se conciliarán automáticamente sin pasar por revisión."}
              </p>
            </div>
          </label>
        </div>

        {/* Histórico */}
        <label className="flex items-start gap-2 cursor-pointer rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12.5px]">
          <Checkbox
            checked={runHistorical}
            onCheckedChange={(v) => setRunHistorical(!!v)}
            className="mt-0.5"
          />
          <div>
            <span className="font-medium flex items-center gap-1.5">
              <PlayCircle className="h-3.5 w-3.5" />
              Aplicar también a movimientos históricos
            </span>
            <p className="text-[12px] text-ds-text-3 mt-0.5">
              Buscar movimientos pasados que cumplan los criterios y aplicar la
              regla.
            </p>
          </div>
        </label>

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
            onClick={handleSave}
            disabled={saving || !preselectedAccountId}
            className="h-10 sm:h-9 w-full sm:w-auto"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            <Sparkles className="h-4 w-4 mr-1.5" />
            Crear regla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
