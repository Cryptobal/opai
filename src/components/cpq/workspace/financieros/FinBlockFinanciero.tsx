"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import type { CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { CalcChain } from "./CalcChain";
import { FieldTooltip } from "./FieldTooltip";
import { SegmentedControl } from "./SegmentedControl";

export function FinBlockFinanciero({
  costParams,
  updateParams,
  costSummary,
  isLocked,
  proposalGoverned,
  decimalDrafts,
  getDecimalValue,
  setDecimalValue,
  clearDecimalValue,
  currency,
  ufValue,
}: {
  costParams: CpqQuoteParameters | null;
  updateParams: (patch: Partial<CpqQuoteParameters>) => void;
  costSummary: CpqQuoteCostSummary | null;
  isLocked: boolean;
  proposalGoverned: boolean;
  decimalDrafts: Record<string, string>;
  getDecimalValue: (key: string, value: number | null | undefined, decimals?: number, allowEmpty?: boolean) => string;
  setDecimalValue: (key: string, value: string) => void;
  clearDecimalValue: (key: string) => void;
  currency: string;
  ufValue: number | null;
}) {
  const enabled = costParams?.financialEnabled ?? false;
  const mode = costParams?.financialBaseMode === "manual" ? "manual" : "auto";
  const rate = Number(costParams?.financialRatePct ?? 2.5);
  const salePrice =
    costSummary?.salePriceMonthly ??
    Number(costParams?.salePriceMonthly ?? 0);
  const monthly = costSummary?.monthlyFinancial ?? 0;
  const disabled = isLocked || proposalGoverned;

  return (
    <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Costo financiero</span>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors sm:min-h-9",
            enabled
              ? "bg-status-ok-soft text-status-ok-fg"
              : "bg-ds-surface-2 text-ds-text-3",
          )}
          onClick={() => updateParams({ financialEnabled: !enabled })}
          aria-pressed={enabled}
          disabled={disabled}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-status-ok" : "bg-ds-text-4")} />
          {enabled ? "Activo" : "Inactivo"}
        </button>
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
          value={mode}
          disabled={disabled}
          onChange={(v) =>
            updateParams({
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

      {mode === "auto" ? (
        <div>
          <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Monto facturado
          </Label>
          <div className="mt-1 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px]">
            <CpqDualCurrencyAmount
              clp={salePrice}
              currency={currency}
              ufValue={ufValue}
              size="sm"
              align="left"
            />
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
            disabled={disabled}
            value={getDecimalValue("salePriceBase", Number(costParams?.salePriceBase ?? 0), 0, true)}
            onChange={(e) => setDecimalValue("salePriceBase", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.salePriceBase;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
              updateParams({ salePriceBase: Math.max(0, parsed), financialEnabled: true });
              clearDecimalValue("salePriceBase");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
            placeholder="4.000.000"
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
          disabled={disabled}
          value={getDecimalValue("financialRatePct", rate, 2, true)}
          onChange={(e) => setDecimalValue("financialRatePct", e.target.value)}
          onBlur={() => {
            const raw = decimalDrafts.financialRatePct;
            if (raw === undefined) return;
            const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
            updateParams({
              financialRatePct: Math.min(20, Math.max(0, parsed)),
              financialEnabled: true,
            });
            clearDecimalValue("financialRatePct");
          }}
          className="mt-1 h-11 text-[13px] sm:h-9"
          placeholder="2,5"
        />
      </div>

      {enabled && (
        <CalcChain
          rows={[
            {
              label: "Monto facturado",
              detail: "precio de venta mensual",
              amount: mode === "manual" ? Number(costParams?.salePriceBase ?? 0) || salePrice : salePrice,
            },
            {
              label: "Tasa aplicada",
              detail: `× ${rate.toFixed(2).replace(".", ",")}% mensual`,
            },
          ]}
          total={monthly}
        />
      )}
    </div>
  );
}
