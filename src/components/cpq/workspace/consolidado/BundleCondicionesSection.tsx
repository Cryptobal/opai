"use client";

/**
 * Condiciones comerciales a nivel propuesta: se editan UNA vez aquí y el
 * servidor las propaga automáticamente a todas las instalaciones (PATCH del
 * bundle → propagate-bundle-conditions). Incluye stepper de gasto financiero
 * 0–6% en pasos de 0,5.
 */

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

/** Borrar el campo deja 0 en el draft sin saltar al default mientras se teclea. */
const toIntDraft = (raw: string): number => {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Normaliza en el blur: fuera de rango vuelve al default del campo. */
const clampInt = (value: number, min: number, max: number, fallback: number): number => {
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return Math.round(value);
};

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
  // Propuesta enviada = inmutable, igual que la cotización enviada en modo
  // única: editar aquí reescribiría condiciones ya comunicadas al cliente en
  // TODAS las instalaciones.
  const isLocked = bundle.status === "sent";
  /** Propuesta v1 sin gobierno: las hijas pueden tener condiciones distintas. */
  const divergent = !bundle.conditionsSynced && bundle.quotes.length > 1;
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState<Form>(() => formFromBundle(bundle));
  /** Hay edición local sin confirmar: el refresh del bundle no debe pisarla. */
  const dirtyRef = useRef(false);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  useEffect(() => {
    if (dirtyRef.current) return;
    setForm(formFromBundle(bundle));
  }, [bundle]);

  const editLocal = (patch: Partial<Form>) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const save = (patch: Partial<Form>) => {
    if (isLocked) return;
    setForm((prev) => ({ ...prev, ...patch }));
    void onPatch(patch as Record<string, unknown>)
      .then(() => {
        dirtyRef.current = false;
      })
      .catch(() => {
        // revert: el bundle en servidor es la verdad
        dirtyRef.current = false;
        setForm(formFromBundle(bundleRef.current));
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
          {isLocked
            ? "Propuesta enviada — condiciones bloqueadas"
            : saving
              ? "Guardando…"
              : "Se aplican a todas las instalaciones"}
        </span>
      </div>

      {divergent && !isLocked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-warn-border bg-status-warn-soft/40 px-3 py-2">
          <p className="text-[12px] text-status-warn-fg">
            Las instalaciones tienen condiciones distintas entre sí. Estas son las
            de la primera; aplícalas para igualar toda la propuesta.
          </p>
          <button
            type="button"
            disabled={applying}
            onClick={() => {
              setApplying(true);
              void onPatch({
                paymentTerms: form.paymentTerms,
                serviceStartDays: form.serviceStartDays,
                contractDuration: form.contractDuration,
                isOngoingService: form.isOngoingService,
                adjustmentType: form.adjustmentType,
                adjustmentFreq: form.adjustmentFreq,
                ipcWeight: form.ipcWeight,
                imoWeight: form.imoWeight,
                insurancePolicyUF: form.insurancePolicyUF,
                liabilityMonths: form.liabilityMonths,
                realAnnualIncrement: form.realAnnualIncrement,
                paymentDays: form.paymentDays,
                financialEnabled: form.financialEnabled,
                financialRatePct: form.financialRatePct,
              }).finally(() => setApplying(false));
            }}
            className="min-h-[36px] shrink-0 rounded-md border border-status-warn-border px-2.5 text-[12px] font-semibold text-status-warn-fg transition-colors hover:bg-status-warn-soft disabled:opacity-50"
          >
            {applying ? "Aplicando…" : "Aplicar a todas"}
          </button>
        </div>
      )}
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        inert={isLocked ? true : undefined}
      >
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
              onChange={(e) => editLocal({ serviceStartDays: toIntDraft(e.target.value) })}
              onBlur={() => save({ serviceStartDays: clampInt(form.serviceStartDays, 1, 90, 5) })}
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
              onChange={(e) => editLocal({ contractDuration: toIntDraft(e.target.value) })}
              onBlur={() => save({ contractDuration: clampInt(form.contractDuration, 1, 60, 12) })}
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
                    const ipc = clampInt(toIntDraft(e.target.value), 0, 100, 0);
                    editLocal({ ipcWeight: ipc, imoWeight: 100 - ipc });
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
                    const imo = clampInt(toIntDraft(e.target.value), 0, 100, 0);
                    editLocal({ imoWeight: imo, ipcWeight: 100 - imo });
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
              onChange={(e) => editLocal({ paymentDays: toIntDraft(e.target.value) })}
              onBlur={() => save({ paymentDays: clampInt(form.paymentDays, 1, 30, 5) })}
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
              onChange={(e) => editLocal({ insurancePolicyUF: toIntDraft(e.target.value) })}
              onBlur={() => save({ insurancePolicyUF: Math.max(0, form.insurancePolicyUF || 0) })}
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
              onChange={(e) => editLocal({ liabilityMonths: toIntDraft(e.target.value) })}
              onBlur={() => save({ liabilityMonths: clampInt(form.liabilityMonths, 1, 24, 3) })}
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
              onChange={(e) => editLocal({ realAnnualIncrement: toIntDraft(e.target.value) })}
              onBlur={() => save({ realAnnualIncrement: clampInt(form.realAnnualIncrement, 0, 100, 0) })}
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
            onChange={(e) => editLocal({ validUntil: e.target.value })}
            onBlur={() => save({ validUntil: form.validUntil || null } as Partial<Form>)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Gasto financiero a nivel propuesta: stepper 0–6% en pasos de 0,5 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-ds-surface-2/40 px-3 py-2.5"
        inert={isLocked ? true : undefined}
      >
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
