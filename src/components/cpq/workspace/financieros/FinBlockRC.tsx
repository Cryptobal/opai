"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import type { CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { CalcChain } from "./CalcChain";
import { FieldTooltip } from "./FieldTooltip";
import { SegmentedControl } from "./SegmentedControl";

export function FinBlockRC({
  costParams,
  updateParams,
  costSummary,
  isLocked,
  decimalDrafts,
  getDecimalValue,
  setDecimalValue,
  clearDecimalValue,
  insurancePolicyUF,
  onInsurancePolicyUFChange,
  ufValue,
}: {
  costParams: CpqQuoteParameters | null;
  updateParams: (patch: Partial<CpqQuoteParameters>) => void;
  costSummary: CpqQuoteCostSummary | null;
  isLocked: boolean;
  decimalDrafts: Record<string, string>;
  getDecimalValue: (key: string, value: number | null | undefined, decimals?: number, allowEmpty?: boolean) => string;
  setDecimalValue: (key: string, value: string) => void;
  clearDecimalValue: (key: string) => void;
  insurancePolicyUF: number | null;
  onInsurancePolicyUFChange: (uf: number | null) => void;
  ufValue: number | null;
}) {
  const enabled = costParams?.liabilityEnabled ?? false;
  const mode = costParams?.liabilityMode === "rate" ? "rate" : "premium";
  const rate = Number(costParams?.liabilityRatePct ?? 0.3);
  const premiumUF = Number(costParams?.liabilityAnnualPremiumUF ?? 0);
  const alloc = Number(costParams?.liabilityAllocationPct ?? 100);
  const deductible = Number(costParams?.liabilityDeductibleUF ?? 0);
  const insured = insurancePolicyUF ?? 0;
  const uf = ufValue && ufValue > 0 ? ufValue : 0;
  const monthly = costSummary?.monthlyLiability ?? 0;
  const annualCLP =
    mode === "premium"
      ? premiumUF * uf
      : insured * uf * (rate / 100);
  const allocated = annualCLP * (alloc / 100);
  const canEnableRate = insured > 0;

  return (
    <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Póliza de responsabilidad civil</span>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors sm:min-h-9",
            enabled ? "bg-status-ok-soft text-status-ok-fg" : "bg-ds-surface-2 text-ds-text-3",
          )}
          onClick={() => {
            if (!enabled && mode === "rate" && !canEnableRate) return;
            updateParams({ liabilityEnabled: !enabled });
          }}
          aria-pressed={enabled}
          disabled={isLocked || (!enabled && mode === "rate" && !canEnableRate)}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-status-ok" : "bg-ds-text-4")} />
          {enabled ? "Activo" : "Inactivo"}
        </button>
      </div>
      <p className="text-[12px] leading-snug text-ds-text-3">
        Cubre <strong className="font-medium text-ds-text-2">daños a terceros</strong> por acción u
        omisión del personal. El monto asegurado se toma de Condiciones y es el mismo que declara el
        contrato.
      </p>

      <div>
        <div className="flex items-center gap-1">
          <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Monto asegurado
          </Label>
          <FieldTooltip
            label="Monto asegurado"
            text="Cobertura máxima exigida por las bases. Se edita en Condiciones → Póliza RC y alimenta la cláusula del contrato. — Un solo dato, dos usos: costo aquí, texto en el contrato."
          />
        </div>
        <Input
          type="text"
          inputMode="decimal"
          disabled={isLocked}
          value={getDecimalValue("insurancePolicyUF", insured, 2, true)}
          onChange={(e) => setDecimalValue("insurancePolicyUF", e.target.value)}
          onBlur={() => {
            const raw = decimalDrafts.insurancePolicyUF;
            if (raw === undefined) return;
            const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
            onInsurancePolicyUFChange(parsed > 0 ? parsed : null);
            clearDecimalValue("insurancePolicyUF");
          }}
          className="mt-1 h-11 border-dashed text-[13px] sm:h-9"
          placeholder="30.000"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Cómo se costea la prima
          </Label>
          <FieldTooltip
            label="Cómo se costea la prima"
            text="Prima directa es la cifra que te cotiza el corredor: usa esta si la tienes. Tasa estima la prima como % del monto asegurado, para cotizar sin cotización de seguro."
          />
        </div>
        <SegmentedControl
          ariaLabel="Modo prima RC"
          value={mode}
          disabled={isLocked}
          onChange={(v) => {
            if (v === "rate" && !canEnableRate) return;
            updateParams({ liabilityMode: v, liabilityEnabled: true });
          }}
          options={[
            { value: "premium", label: "Prima directa" },
            { value: "rate", label: "Tasa estimada" },
          ]}
        />
      </div>

      {mode === "premium" ? (
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Prima anual
            </Label>
            <FieldTooltip
              label="Prima anual"
              text="Prima anual total de la póliza, en UF, según la cotización de tu corredor."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("liabilityAnnualPremiumUF", premiumUF, 2, true)}
            onChange={(e) => setDecimalValue("liabilityAnnualPremiumUF", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.liabilityAnnualPremiumUF;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
              updateParams({
                liabilityAnnualPremiumUF: Math.max(0, parsed),
                liabilityEnabled: true,
              });
              clearDecimalValue("liabilityAnnualPremiumUF");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Tasa anual
            </Label>
            <FieldTooltip
              label="Tasa anual"
              text="% anual sobre el monto asegurado. Referencia en seguridad privada: 0,2 % a 0,5 % anual. — Estimación. Reemplázala por la prima directa cuando la tengas."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("liabilityRatePct", rate, 2, true)}
            onChange={(e) => setDecimalValue("liabilityRatePct", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.liabilityRatePct;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0.3;
              updateParams({
                liabilityRatePct: Math.min(10, Math.max(0, parsed)),
                liabilityEnabled: true,
              });
              clearDecimalValue("liabilityRatePct");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Imputado a este contrato
            </Label>
            <FieldTooltip
              label="Imputado a este contrato"
              text="Si la póliza es maestra y cubre varios contratos, imputa solo la fracción que corresponde. 100 % si es exclusiva de este servicio. — Ej.: póliza que cubre 4 contratos similares → 25 %."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("liabilityAllocationPct", alloc, 2)}
            onChange={(e) => setDecimalValue("liabilityAllocationPct", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.liabilityAllocationPct;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 100;
              updateParams({
                liabilityAllocationPct: Math.min(100, Math.max(0.1, parsed)),
                liabilityEnabled: true,
              });
              clearDecimalValue("liabilityAllocationPct");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Deducible · informativo
            </Label>
            <FieldTooltip
              label="Deducible"
              text="Monto que asume el asegurado por siniestro. No afecta el precio: se declara en la propuesta y el contrato porque las bases suelen exigir un tope."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("liabilityDeductibleUF", deductible, 2, true)}
            onChange={(e) => setDecimalValue("liabilityDeductibleUF", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.liabilityDeductibleUF;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
              updateParams({ liabilityDeductibleUF: Math.max(0, parsed) });
              clearDecimalValue("liabilityDeductibleUF");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
      </div>

      {enabled && (
        <>
          {costSummary?.missingUf && (
            <div className="rounded-md border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-[12px] text-status-warn-fg">
              falta valor UF
            </div>
          )}
          <CalcChain
            rows={[
              {
                label: "Monto asegurado",
                detail: `${insured.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF × valor UF`,
                amount: insured * uf,
              },
              {
                label: "Prima anual",
                detail:
                  mode === "premium"
                    ? `${premiumUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF × valor UF`
                    : `× ${rate.toFixed(2).replace(".", ",")}% anual`,
                amount: annualCLP,
                highlight: true,
              },
              {
                label: "Imputado al contrato",
                detail: `× ${alloc.toFixed(2).replace(".", ",")}% del contrato`,
                amount: allocated,
              },
            ]}
            total={monthly}
          />
        </>
      )}
    </div>
  );
}
