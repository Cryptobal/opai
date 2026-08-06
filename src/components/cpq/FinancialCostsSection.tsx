"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import type {
  CpqQuoteParameters,
  FinancialBaseMode,
  LiabilityMode,
  PolicyAmountMode,
} from "@/types/cpq";
import { computeFinancialAndPolicy } from "@/modules/cpq/costing/financial-policy";
import { useUfValue } from "@/components/cpq/workspace/useUfValue";
import { useState } from "react";
import { CalcChain } from "./workspace/financieros/CalcChain";
import { FieldTooltip } from "./workspace/financieros/FieldTooltip";
import { SegmentedControl } from "./workspace/financieros/SegmentedControl";

export interface FinancialCostsData {
  financialEnabled: boolean;
  financialRatePct: number;
  financialBaseMode?: FinancialBaseMode;
  salePriceBase: number;
  policyEnabled: boolean;
  policyAmountMode?: PolicyAmountMode;
  policyRatePct: number;
  policyAdminRatePct?: number;
  policyContractMonths: number;
  policyContractPct: number;
  policyFixedAmountUF?: number;
  liabilityEnabled?: boolean;
  liabilityMode?: LiabilityMode;
  liabilityRatePct?: number;
  liabilityAnnualPremiumUF?: number;
  liabilityAllocationPct?: number;
  liabilityDeductibleUF?: number;
  insurancePolicyUF?: number | null;
}

interface FinancialCostsSectionProps {
  value: FinancialCostsData;
  onChange: (data: FinancialCostsData) => void;
  isLocked?: boolean;
  calculatedBase?: number;
  contractDuration?: number;
}

export function FinancialCostsSection({
  value,
  onChange,
  isLocked,
  calculatedBase,
  contractDuration = 12,
}: FinancialCostsSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const ufValue = useUfValue();

  const getDraft = (key: string, val: number, decimals = 2) => {
    if (key in drafts) return drafts[key];
    return formatNumber(val, { minDecimals: decimals, maxDecimals: decimals });
  };
  const setDraft = (key: string, v: string) => setDrafts((prev) => ({ ...prev, [key]: v }));
  const clearDraft = (key: string) =>
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });

  const update = (patch: Partial<FinancialCostsData>) => onChange({ ...value, ...patch });

  const baseMode: FinancialBaseMode =
    value.financialBaseMode ?? (value.salePriceBase > 0 ? "manual" : "auto");
  const policyMode: PolicyAmountMode = value.policyAmountMode ?? "pct";
  const liabilityMode: LiabilityMode = value.liabilityMode ?? "premium";

  const result = computeFinancialAndPolicy({
    baseWithMargin: calculatedBase ?? 0,
    additionalLinesTotalWithMargin: 0,
    costsBase: 0,
    financialEnabled: value.financialEnabled,
    financialRatePct: value.financialRatePct,
    financialBaseMode: baseMode,
    salePriceBase: value.salePriceBase,
    policyEnabled: value.policyEnabled,
    policyAmountMode: policyMode,
    policyContractMonths: value.policyContractMonths,
    policyContractPct: value.policyContractPct,
    policyRatePct: value.policyRatePct,
    policyAdminRatePct: value.policyAdminRatePct ?? 0.2,
    policyFixedAmountUF: value.policyFixedAmountUF ?? 0,
    liabilityEnabled: value.liabilityEnabled ?? false,
    liabilityMode,
    liabilityRatePct: value.liabilityRatePct ?? 0.3,
    liabilityAnnualPremiumUF: value.liabilityAnnualPremiumUF ?? 0,
    liabilityAllocationPct: value.liabilityAllocationPct ?? 100,
    insurancePolicyUF: value.insurancePolicyUF ?? null,
    liabilityDeductibleUF: value.liabilityDeductibleUF ?? 0,
    ufValue,
  });

  const salePrice = result.salePriceMonthly;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {/* Costo financiero */}
      <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">Costo financiero</span>
          <ToggleChip
            enabled={value.financialEnabled}
            disabled={isLocked}
            onClick={() => update({ financialEnabled: !value.financialEnabled })}
          />
        </div>
        <p className="text-[12px] leading-snug text-ds-text-3">
          Financiar el <strong className="font-medium text-ds-text-2">capital de trabajo</strong>: pagas
          remuneraciones antes de que el cliente pague la factura. Se aplica sobre el monto facturado.
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Base de cálculo
            </Label>
            <FieldTooltip
              label="Base de cálculo"
              text="Automática sigue el precio de venta vigente y se actualiza al cambiar puestos o costos. Manual congela un monto fijo. — Usa manual solo si negociaste una línea de financiamiento por un monto distinto al facturado."
            />
          </div>
          <SegmentedControl
            ariaLabel="Base de cálculo financiera"
            value={baseMode}
            disabled={isLocked}
            onChange={(v) =>
              update({
                financialBaseMode: v,
                ...(v === "auto" ? { salePriceBase: 0 } : {}),
              })
            }
            options={[
              { value: "auto", label: "Automática" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </div>
        {baseMode === "auto" ? (
          <div>
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Monto facturado
            </Label>
            <div className="mt-1 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px]">
              {formatCurrency(salePrice)}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                Base manual
              </Label>
              <FieldTooltip
                label="Base manual"
                text="Monto fijo sobre el que se calcula el costo financiero. No se actualiza solo. — Revísalo cada vez que cambie la dotación."
              />
            </div>
            <Input
              type="text"
              inputMode="numeric"
              disabled={isLocked}
              value={getDraft("salePriceBase", value.salePriceBase, 0)}
              onChange={(e) => setDraft("salePriceBase", e.target.value)}
              onBlur={() => {
                const raw = drafts.salePriceBase;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                update({ salePriceBase: Math.max(0, parsed), financialEnabled: true });
                clearDraft("salePriceBase");
              }}
              className="mt-1 h-11 text-[13px] sm:h-9"
            />
          </div>
        )}
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Tasa mensual
            </Label>
            <FieldTooltip
              label="Tasa mensual"
              text="Costo mensual del financiamiento, no anual. Referencia: factoring 1,8 %–3,0 % mensual. — Con pago a 30 días y tasa 2,5 %, financias un mes de facturación."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDraft("financialRatePct", value.financialRatePct)}
            onChange={(e) => setDraft("financialRatePct", e.target.value)}
            onBlur={() => {
              const raw = drafts.financialRatePct;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
              update({
                financialRatePct: Math.min(20, Math.max(0, parsed)),
                financialEnabled: true,
              });
              clearDraft("financialRatePct");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
        {value.financialEnabled && (
          <CalcChain
            rows={[
              {
                label: "Monto facturado",
                detail: "precio de venta mensual",
                amount: baseMode === "manual" ? value.salePriceBase || salePrice : salePrice,
              },
              {
                label: "Tasa aplicada",
                detail: `× ${value.financialRatePct.toFixed(2).replace(".", ",")}% mensual`,
              },
            ]}
            total={result.monthlyFinancial}
          />
        )}
      </div>

      {/* Póliza de garantía */}
      <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">Póliza de garantía</span>
          <ToggleChip
            enabled={value.policyEnabled}
            disabled={isLocked}
            onClick={() => update({ policyEnabled: !value.policyEnabled })}
          />
        </div>
        <p className="text-[12px] leading-snug text-ds-text-3">
          <strong className="font-medium text-ds-text-2">Fiel cumplimiento de contrato.</strong> Instrumento
          que el mandante exige para respaldar el cumplimiento. Reemplaza a la boleta bancaria.
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Cómo se define el monto garantizado
            </Label>
            <FieldTooltip
              label="Cómo se define el monto garantizado"
              text="% del contrato cuando las bases piden 'garantía equivalente al X % del valor total'. Monto fijo cuando piden una cifra cerrada en UF. — Lee las bases: casi siempre lo dicen textual."
            />
          </div>
          <SegmentedControl
            ariaLabel="Modo monto garantía"
            value={policyMode}
            disabled={isLocked}
            onChange={(v) => update({ policyAmountMode: v, policyEnabled: true })}
            options={[
              { value: "pct", label: "% del contrato" },
              { value: "fija", label: "Monto fijo UF" },
            ]}
          />
        </div>
        {policyMode === "pct" ? (
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Meses garantizados"
              tooltip="Meses de contrato que entran en el valor a garantizar. Normalmente igual a la duración del contrato. — Si difiere de la duración, te lo advierte abajo."
              disabled={isLocked}
              type="number"
              value={value.policyContractMonths}
              onChange={(n) =>
                update({
                  policyContractMonths: Math.min(120, Math.max(1, n || 1)),
                  policyEnabled: true,
                })
              }
            />
            <DraftField
              label="% garantizado"
              tooltip="Fracción del valor total del contrato que debe quedar garantizada. Rango habitual en licitación privada: 5 % a 20 %. — 100 % no es una garantía, es el contrato completo. Revísalo si lo ves."
              disabled={isLocked}
              draftKey="policyContractPct"
              value={value.policyContractPct}
              getDraft={getDraft}
              setDraft={setDraft}
              drafts={drafts}
              clearDraft={clearDraft}
              onCommit={(n) =>
                update({
                  policyContractPct: Math.min(100, Math.max(0.1, n)),
                  policyEnabled: true,
                })
              }
              fallback={10}
            />
          </div>
        ) : (
          <DraftField
            label="Monto garantizado"
            tooltip="Cifra cerrada exigida por las bases, en UF. No depende del precio de venta."
            disabled={isLocked}
            draftKey="policyFixedAmountUF"
            value={value.policyFixedAmountUF ?? 0}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) => update({ policyFixedAmountUF: Math.max(0, n), policyEnabled: true })}
            fallback={0}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <DraftField
            label="Prima anual"
            tooltip="Tasa anual que cobra la aseguradora sobre el monto garantizado. Referencia: 1 % a 3 % anual. — Es lo que te cotiza tu corredor. No confundir con el % garantizado."
            disabled={isLocked}
            draftKey="policyRatePct"
            value={value.policyRatePct}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) =>
              update({ policyRatePct: Math.min(20, Math.max(0, n)), policyEnabled: true })
            }
            fallback={2}
          />
          <DraftField
            label="Derechos de emisión"
            tooltip="Cargo por única vez al emitir la póliza, como % del monto garantizado. Referencia: 0,1 % a 0,5 %. — Se prorratea sobre los meses de vigencia, no sobre 12."
            disabled={isLocked}
            draftKey="policyAdminRatePct"
            value={value.policyAdminRatePct ?? 0.2}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) =>
              update({
                policyAdminRatePct: Math.min(5, Math.max(0, n)),
                policyEnabled: true,
              })
            }
            fallback={0.2}
          />
        </div>
        {value.policyEnabled && (
          <CalcChain
            rows={[
              {
                label: "Monto garantizado",
                amount: result.policyGuaranteedAmount,
                highlight: true,
              },
              { label: "Prima + derechos", amount: result.monthlyPolicy + result.monthlyPolicyAdmin },
            ]}
            total={result.monthlyPolicy + result.monthlyPolicyAdmin}
          />
        )}
        {value.policyEnabled && value.policyContractMonths !== contractDuration && (
          <div className="rounded-md border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-[12px] text-status-warn-fg">
            Los meses garantizados ({value.policyContractMonths}) no coinciden con la duración del
            contrato ({contractDuration}).
          </div>
        )}
      </div>

      {/* RC */}
      <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">Póliza de responsabilidad civil</span>
          <ToggleChip
            enabled={value.liabilityEnabled ?? false}
            disabled={isLocked}
            onClick={() => update({ liabilityEnabled: !(value.liabilityEnabled ?? false) })}
          />
        </div>
        <p className="text-[12px] leading-snug text-ds-text-3">
          Cubre <strong className="font-medium text-ds-text-2">daños a terceros</strong> por acción u
          omisión del personal. El monto asegurado se edita aquí y es el mismo que declara el
          contrato.
        </p>
        <DraftField
          label="Monto asegurado"
          tooltip="Cobertura máxima exigida por las bases. Se edita aquí (no en Condiciones) y alimenta la cláusula del contrato. — Un solo dato, dos usos: costo y texto contractual."
          disabled={isLocked}
          draftKey="insurancePolicyUF"
          value={value.insurancePolicyUF ?? 0}
          getDraft={getDraft}
          setDraft={setDraft}
          drafts={drafts}
          clearDraft={clearDraft}
          onCommit={(n) => update({ insurancePolicyUF: n > 0 ? n : null })}
          fallback={0}
          dashed
        />
        <SegmentedControl
          ariaLabel="Modo prima RC"
          value={liabilityMode}
          disabled={isLocked}
          onChange={(v) => update({ liabilityMode: v, liabilityEnabled: true })}
          options={[
            { value: "premium", label: "Prima directa" },
            { value: "rate", label: "Tasa estimada" },
          ]}
        />
        {liabilityMode === "premium" ? (
          <DraftField
            label="Prima anual"
            tooltip="Prima anual total de la póliza, en UF, según la cotización de tu corredor."
            disabled={isLocked}
            draftKey="liabilityAnnualPremiumUF"
            value={value.liabilityAnnualPremiumUF ?? 0}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) =>
              update({ liabilityAnnualPremiumUF: Math.max(0, n), liabilityEnabled: true })
            }
            fallback={0}
          />
        ) : (
          <DraftField
            label="Tasa anual"
            tooltip="% anual sobre el monto asegurado. Referencia en seguridad privada: 0,2 % a 0,5 % anual. — Estimación. Reemplázala por la prima directa cuando la tengas."
            disabled={isLocked}
            draftKey="liabilityRatePct"
            value={value.liabilityRatePct ?? 0.3}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) =>
              update({
                liabilityRatePct: Math.min(10, Math.max(0, n)),
                liabilityEnabled: true,
              })
            }
            fallback={0.3}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <DraftField
            label="Imputado a este contrato"
            tooltip="Si la póliza es maestra y cubre varios contratos, imputa solo la fracción que corresponde. 100 % si es exclusiva de este servicio. — Ej.: póliza que cubre 4 contratos similares → 25 %."
            disabled={isLocked}
            draftKey="liabilityAllocationPct"
            value={value.liabilityAllocationPct ?? 100}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) =>
              update({
                liabilityAllocationPct: Math.min(100, Math.max(0.1, n)),
                liabilityEnabled: true,
              })
            }
            fallback={100}
          />
          <DraftField
            label="Deducible · informativo"
            tooltip="Monto que asume el asegurado por siniestro. No afecta el precio: se declara en la propuesta y el contrato porque las bases suelen exigir un tope."
            disabled={isLocked}
            draftKey="liabilityDeductibleUF"
            value={value.liabilityDeductibleUF ?? 0}
            getDraft={getDraft}
            setDraft={setDraft}
            drafts={drafts}
            clearDraft={clearDraft}
            onCommit={(n) => update({ liabilityDeductibleUF: Math.max(0, n) })}
            fallback={0}
          />
        </div>
        {(value.liabilityEnabled ?? false) && (
          <CalcChain
            rows={[{ label: "Prima imputada / 12", amount: result.monthlyLiability, highlight: true }]}
            total={result.monthlyLiability}
          />
        )}
      </div>
    </div>
  );
}

function ToggleChip({
  enabled,
  disabled,
  onClick,
}: {
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors sm:min-h-9",
        enabled ? "bg-status-ok-soft text-status-ok-fg" : "bg-ds-surface-2 text-ds-text-3",
      )}
      onClick={onClick}
      aria-pressed={enabled}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-status-ok" : "bg-ds-text-4")} />
      {enabled ? "Activo" : "Inactivo"}
    </button>
  );
}

function NumField({
  label,
  tooltip,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  tooltip: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">{label}</Label>
        <FieldTooltip label={label} text={tooltip} />
      </div>
      <Input
        type={type}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseLocalizedNumber(e.target.value))}
        className="mt-1 h-11 text-[13px] sm:h-9"
      />
    </div>
  );
}

function DraftField({
  label,
  tooltip,
  draftKey,
  value,
  getDraft,
  setDraft,
  drafts,
  clearDraft,
  onCommit,
  fallback,
  disabled,
  dashed,
}: {
  label: string;
  tooltip: string;
  draftKey: string;
  value: number;
  getDraft: (key: string, val: number, decimals?: number) => string;
  setDraft: (key: string, v: string) => void;
  drafts: Record<string, string>;
  clearDraft: (key: string) => void;
  onCommit: (n: number) => void;
  fallback: number;
  disabled?: boolean;
  dashed?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">{label}</Label>
        <FieldTooltip label={label} text={tooltip} />
      </div>
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={getDraft(draftKey, value)}
        onChange={(e) => setDraft(draftKey, e.target.value)}
        onBlur={() => {
          const raw = drafts[draftKey];
          if (raw === undefined) return;
          const parsed = raw.trim() ? parseLocalizedNumber(raw) : fallback;
          onCommit(parsed);
          clearDraft(draftKey);
        }}
        className={cn("mt-1 h-11 text-[13px] sm:h-9", dashed && "border-dashed")}
      />
    </div>
  );
}

export function financialCostsDataFromParams(params: CpqQuoteParameters | null): FinancialCostsData {
  return {
    financialEnabled: params?.financialEnabled ?? true,
    financialRatePct: params?.financialRatePct ?? 2.5,
    financialBaseMode: params?.financialBaseMode ?? "auto",
    salePriceBase: params?.salePriceBase ?? 0,
    policyEnabled: params?.policyEnabled ?? false,
    policyAmountMode: params?.policyAmountMode ?? "pct",
    policyRatePct: params?.policyRatePct ?? 2,
    policyAdminRatePct: params?.policyAdminRatePct ?? 0.2,
    policyContractMonths: params?.policyContractMonths ?? 12,
    policyContractPct: params?.policyContractPct ?? 10,
    policyFixedAmountUF: params?.policyFixedAmountUF ?? 0,
    liabilityEnabled: params?.liabilityEnabled ?? false,
    liabilityMode: params?.liabilityMode ?? "premium",
    liabilityRatePct: params?.liabilityRatePct ?? 0.3,
    liabilityAnnualPremiumUF: params?.liabilityAnnualPremiumUF ?? 0,
    liabilityAllocationPct: params?.liabilityAllocationPct ?? 100,
    liabilityDeductibleUF: params?.liabilityDeductibleUF ?? 0,
  };
}
