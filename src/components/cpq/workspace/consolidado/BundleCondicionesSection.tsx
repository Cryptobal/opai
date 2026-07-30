"use client";

/**
 * Condiciones comerciales a nivel propuesta: se editan UNA vez aquí y el
 * servidor las propaga automáticamente a todas las instalaciones (PATCH del
 * bundle → propagate-bundle-conditions). Incluye stepper de gasto financiero
 * 0–6% en pasos de 0,5.
 */

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

const toNum = (v: unknown, fallback: number): number => {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

type Form = {
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  isOngoingService: boolean;
  adjustmentType: string;
  adjustmentFreq: string | null;
  ipcWeight: number | null;
  imoWeight: number | null;
  insurancePolicyUF: number;
  liabilityMonths: number;
  realAnnualIncrement: number;
  paymentDays: number;
  validUntil: string;
  financialEnabled: boolean;
  financialRatePct: number;
};

function formFromBundle(bundle: BundleDetail): Form {
  const ref = bundle.quotes[0]?.quote;
  return {
    paymentTerms: bundle.paymentTerms ?? ref?.paymentTerms ?? "contrafactura",
    serviceStartDays: toNum(bundle.serviceStartDays ?? ref?.serviceStartDays, 5),
    contractDuration: toNum(bundle.contractDuration ?? ref?.contractDuration, 12),
    isOngoingService: bundle.isOngoingService ?? ref?.isOngoingService ?? true,
    adjustmentType: bundle.adjustmentType ?? ref?.adjustmentType ?? "NONE",
    adjustmentFreq: bundle.adjustmentFreq ?? ref?.adjustmentFreq ?? null,
    ipcWeight: bundle.ipcWeight ?? ref?.ipcWeight ?? null,
    imoWeight: bundle.imoWeight ?? ref?.imoWeight ?? null,
    insurancePolicyUF: toNum(bundle.insurancePolicyUF ?? ref?.insurancePolicyUF, 1500),
    liabilityMonths: toNum(bundle.liabilityMonths ?? ref?.liabilityMonths, 3),
    realAnnualIncrement: toNum(bundle.realAnnualIncrement ?? ref?.realAnnualIncrement, 3),
    paymentDays: toNum(bundle.paymentDays ?? ref?.paymentDays, 5),
    validUntil: (bundle.validUntil ?? ref?.validUntil ?? "").slice(0, 10),
    financialEnabled:
      bundle.financialEnabled ?? ref?.parameters?.financialEnabled ?? false,
    financialRatePct: toNum(
      bundle.financialRatePct ?? ref?.parameters?.financialRatePct,
      2.5,
    ),
  };
}

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const INPUT_CLASS = "h-9 bg-card text-foreground border-border text-xs";
const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function BundleCondicionesSection({
  bundle,
  saving,
  onPatch,
}: {
  bundle: BundleDetail;
  saving: boolean;
  /** PATCH del bundle: el servidor propaga a todas las hijas y recalcula. */
  onPatch: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(() => formFromBundle(bundle));
  useEffect(() => {
    setForm(formFromBundle(bundle));
  }, [bundle]);

  const save = (patch: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    void onPatch(patch as Record<string, unknown>).catch(() => {
      // revert optimista: el refresh del hook restaurará el valor real
      setForm(formFromBundle(bundle));
    });
  };

  const stepRate = (delta: number) => {
    const next = Math.min(6, Math.max(0, Math.round((form.financialRatePct + delta) * 2) / 2));
    if (next === form.financialRatePct) return;
    save({ financialRatePct: next, financialEnabled: true });
  };

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-condiciones-bundle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base text-foreground">
          Condiciones comerciales
        </h2>
        <span className="text-[12px] text-ds-text-3">
          {saving ? "Guardando…" : "Se aplican a todas las instalaciones"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Forma de pago</Label>
          <select
            value={form.paymentTerms}
            onChange={(e) => save({ paymentTerms: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="contrafactura">Contrafactura</option>
            <option value="30_dias">30 días</option>
            <option value="anticipado">Pago anticipado</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Inicio servicios</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={90}
              value={form.serviceStartDays}
              onChange={(e) => setForm((p) => ({ ...p, serviceStartDays: Number(e.target.value) || 5 }))}
              onBlur={() => save({ serviceStartDays: form.serviceStartDays })}
              className={cn(INPUT_CLASS, "w-16")}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>
            {form.isOngoingService ? "Compromiso / reajuste" : "Duración"}
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.contractDuration}
              onChange={(e) => setForm((p) => ({ ...p, contractDuration: Number(e.target.value) || 12 }))}
              onBlur={() => save({ contractDuration: form.contractDuration })}
              className={cn(INPUT_CLASS, "w-16")}
            />
            <span className="text-xs text-muted-foreground">meses</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Servicio continuo</Label>
          <div className="flex h-9 items-center gap-2">
            <Switch
              checked={form.isOngoingService}
              onCheckedChange={(checked) => save({ isOngoingService: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {form.isOngoingService ? "Indefinido" : "Plazo definido"}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Tipo de reajuste</Label>
          <select
            value={form.adjustmentType}
            onChange={(e) => {
              const type = e.target.value;
              save({
                adjustmentType: type,
                ...(type === "NONE"
                  ? { adjustmentFreq: null, ipcWeight: null, imoWeight: null }
                  : {}),
              });
            }}
            className={SELECT_CLASS}
          >
            <option value="NONE">Sin reajuste</option>
            <option value="IPC">IPC</option>
            <option value="IMO">Índice Mano de Obra</option>
            <option value="POLYNOMIAL">Polinomio mixto</option>
          </select>
        </div>
        {form.adjustmentType !== "NONE" && (
          <div className="space-y-1">
            <Label className={LABEL_CLASS}>Frecuencia</Label>
            <select
              value={form.adjustmentFreq ?? ""}
              onChange={(e) => save({ adjustmentFreq: e.target.value || null })}
              className={SELECT_CLASS}
            >
              <option value="">Seleccionar</option>
              <option value="TRIMESTRAL">Trimestral</option>
              <option value="SEMESTRAL">Semestral</option>
              <option value="ANUAL">Anual</option>
            </select>
          </div>
        )}
        {form.adjustmentType === "POLYNOMIAL" && (
          <>
            <div className="space-y-1">
              <Label className={LABEL_CLASS}>% IPC</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.ipcWeight ?? ""}
                  onChange={(e) => {
                    const ipc = Number(e.target.value) || 0;
                    setForm((p) => ({ ...p, ipcWeight: ipc, imoWeight: 100 - ipc }));
                  }}
                  onBlur={() => save({ ipcWeight: form.ipcWeight, imoWeight: form.imoWeight })}
                  className={cn(INPUT_CLASS, "w-16")}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className={LABEL_CLASS}>% IMO</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.imoWeight ?? ""}
                  onChange={(e) => {
                    const imo = Number(e.target.value) || 0;
                    setForm((p) => ({ ...p, imoWeight: imo, ipcWeight: 100 - imo }));
                  }}
                  onBlur={() => save({ ipcWeight: form.ipcWeight, imoWeight: form.imoWeight })}
                  className={cn(INPUT_CLASS, "w-16")}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Días de pago</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={30}
              value={form.paymentDays}
              onChange={(e) => setForm((p) => ({ ...p, paymentDays: Number(e.target.value) || 5 }))}
              onBlur={() => save({ paymentDays: form.paymentDays })}
              className={cn(INPUT_CLASS, "w-16")}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Monto póliza</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.insurancePolicyUF}
              onChange={(e) => setForm((p) => ({ ...p, insurancePolicyUF: Number(e.target.value) || 1500 }))}
              onBlur={() => save({ insurancePolicyUF: form.insurancePolicyUF })}
              className={cn(INPUT_CLASS, "w-20")}
            />
            <span className="text-xs text-muted-foreground">UF</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Límite responsabilidad</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={24}
              value={form.liabilityMonths}
              onChange={(e) => setForm((p) => ({ ...p, liabilityMonths: Number(e.target.value) || 3 }))}
              onBlur={() => save({ liabilityMonths: form.liabilityMonths })}
              className={cn(INPUT_CLASS, "w-16")}
            />
            <span className="text-xs text-muted-foreground">meses</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Incremento real anual</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.realAnnualIncrement}
              onChange={(e) => {
                const n = Number(e.target.value);
                setForm((p) => ({
                  ...p,
                  realAnnualIncrement: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0,
                }));
              }}
              onBlur={() => save({ realAnnualIncrement: form.realAnnualIncrement })}
              className={cn(INPUT_CLASS, "w-16")}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Válida hasta</Label>
          <Input
            type="date"
            value={form.validUntil}
            onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
            onBlur={() => save({ validUntil: form.validUntil || null } as Partial<Form>)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Gasto financiero a nivel propuesta: stepper 0–6% en pasos de 0,5 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-ds-surface-2/40 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gasto financiero
            </p>
            <p className="text-[12px] text-ds-text-3">
              Tasa única para todas las instalaciones
            </p>
          </div>
          <Switch
            checked={form.financialEnabled}
            onCheckedChange={(checked) => save({ financialEnabled: checked })}
            aria-label="Activar gasto financiero"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepRate(-0.5)}
            disabled={!form.financialEnabled || form.financialRatePct <= 0}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors enabled:hover:bg-muted disabled:opacity-40"
            aria-label="Bajar tasa financiera"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span
            className={cn(
              "w-16 text-center font-mono text-[15px] font-bold tabular-nums",
              form.financialEnabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {form.financialRatePct.toLocaleString("es-CL", { minimumFractionDigits: 1 })}%
          </span>
          <button
            type="button"
            onClick={() => stepRate(0.5)}
            disabled={!form.financialEnabled || form.financialRatePct >= 6}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors enabled:hover:bg-muted disabled:opacity-40"
            aria-label="Subir tasa financiera"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Surface>
  );
}
