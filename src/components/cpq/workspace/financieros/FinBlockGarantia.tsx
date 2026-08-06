"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import type { CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { CalcChain } from "./CalcChain";
import { FieldTooltip } from "./FieldTooltip";
import { SegmentedControl } from "./SegmentedControl";

export function FinBlockGarantia({
  costParams,
  updateParams,
  costSummary,
  isLocked,
  decimalDrafts,
  getDecimalValue,
  setDecimalValue,
  clearDecimalValue,
  contractDuration,
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
  contractDuration: number;
  ufValue: number | null;
}) {
  const enabled = costParams?.policyEnabled ?? false;
  const mode = costParams?.policyAmountMode === "fija" ? "fija" : "pct";
  const months = costParams?.policyContractMonths ?? contractDuration ?? 12;
  const pct = Number(costParams?.policyContractPct ?? 10);
  const rate = Number(costParams?.policyRatePct ?? 2);
  const admin = Number(costParams?.policyAdminRatePct ?? 0.2);
  const fixedUF = Number(costParams?.policyFixedAmountUF ?? 0);
  const salePrice = costSummary?.salePriceMonthly ?? Number(costParams?.salePriceMonthly ?? 0);
  const guaranteed = costSummary?.policyGuaranteedAmount ?? 0;
  const monthlyPolicy = costSummary?.monthlyPolicy ?? 0;
  const monthlyAdmin = costSummary?.monthlyPolicyAdmin ?? 0;
  const total = monthlyPolicy + monthlyAdmin;
  const contractValue = salePrice * months;

  const warnings: string[] = [];
  if (enabled && months !== contractDuration) {
    warnings.push(
      `Los meses garantizados (${months}) no coinciden con la duración del contrato (${contractDuration}).`,
    );
  }
  if (enabled && mode === "pct" && pct > 50) {
    warnings.push(`Un ${pct.toFixed(1).replace(".", ",")} % garantizado es inusualmente alto. Verifica las bases.`);
  }
  for (const w of costSummary?.financialWarnings ?? []) {
    if (w.includes("35")) warnings.push(w);
  }

  return (
    <div className="flex h-full flex-col space-y-2 rounded-md border border-ds-border-default bg-ds-surface-1/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Póliza de garantía</span>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors sm:min-h-9",
            enabled ? "bg-status-ok-soft text-status-ok-fg" : "bg-ds-surface-2 text-ds-text-3",
          )}
          onClick={() => updateParams({ policyEnabled: !enabled })}
          aria-pressed={enabled}
          disabled={isLocked}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-status-ok" : "bg-ds-text-4")} />
          {enabled ? "Activo" : "Inactivo"}
        </button>
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
          value={mode}
          disabled={isLocked}
          onChange={(v) => updateParams({ policyAmountMode: v, policyEnabled: true })}
          options={[
            { value: "pct", label: "% del contrato" },
            { value: "fija", label: "Monto fijo UF" },
          ]}
        />
      </div>

      {mode === "pct" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                Meses garantizados
              </Label>
              <FieldTooltip
                label="Meses garantizados"
                text="Meses de contrato que entran en el valor a garantizar. Normalmente igual a la duración del contrato. — Si difiere de la duración, te lo advierte abajo."
              />
            </div>
            <Input
              type="number"
              disabled={isLocked}
              min={1}
              max={120}
              value={months}
              onChange={(e) =>
                updateParams({
                  policyContractMonths: Math.min(120, Math.max(1, parseLocalizedNumber(e.target.value) || 1)),
                  policyEnabled: true,
                })
              }
              className="mt-1 h-11 text-[13px] sm:h-9"
            />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                % garantizado
              </Label>
              <FieldTooltip
                label="% garantizado"
                text="Fracción del valor total del contrato que debe quedar garantizada. Rango habitual en licitación privada: 5 % a 20 %. — 100 % no es una garantía, es el contrato completo. Revísalo si lo ves."
              />
            </div>
            <Input
              type="text"
              inputMode="decimal"
              disabled={isLocked}
              value={getDecimalValue("policyContractPct", pct, 2)}
              onChange={(e) => setDecimalValue("policyContractPct", e.target.value)}
              onBlur={() => {
                const raw = decimalDrafts.policyContractPct;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 10;
                updateParams({
                  policyContractPct: Math.min(100, Math.max(0.1, parsed)),
                  policyEnabled: true,
                });
                clearDecimalValue("policyContractPct");
              }}
              className="mt-1 h-11 text-[13px] sm:h-9"
            />
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Monto garantizado
            </Label>
            <FieldTooltip
              label="Monto garantizado"
              text="Cifra cerrada exigida por las bases, en UF. No depende del precio de venta."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("policyFixedAmountUF", fixedUF, 2, true)}
            onChange={(e) => setDecimalValue("policyFixedAmountUF", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.policyFixedAmountUF;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
              updateParams({ policyFixedAmountUF: Math.max(0, parsed), policyEnabled: true });
              clearDecimalValue("policyFixedAmountUF");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
            placeholder="UF"
          />
          {(!ufValue || ufValue <= 0) && (
            <p className="mt-1 text-[12px] text-status-warn-fg">falta valor UF</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Prima anual
            </Label>
            <FieldTooltip
              label="Prima anual"
              text="Tasa anual que cobra la aseguradora sobre el monto garantizado. Referencia: 1 % a 3 % anual. — Es lo que te cotiza tu corredor. No confundir con el % garantizado."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("policyRatePct", rate, 2, true)}
            onChange={(e) => setDecimalValue("policyRatePct", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.policyRatePct;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2;
              updateParams({
                policyRatePct: Math.min(20, Math.max(0, parsed)),
                policyEnabled: true,
              });
              clearDecimalValue("policyRatePct");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Derechos de emisión
            </Label>
            <FieldTooltip
              label="Derechos de emisión"
              text="Cargo por única vez al emitir la póliza, como % del monto garantizado. Referencia: 0,1 % a 0,5 %. — Se prorratea sobre los meses de vigencia, no sobre 12."
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            disabled={isLocked}
            value={getDecimalValue("policyAdminRatePct", admin, 2, true)}
            onChange={(e) => setDecimalValue("policyAdminRatePct", e.target.value)}
            onBlur={() => {
              const raw = decimalDrafts.policyAdminRatePct;
              if (raw === undefined) return;
              const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0.2;
              updateParams({
                policyAdminRatePct: Math.min(5, Math.max(0, parsed)),
                policyEnabled: true,
              });
              clearDecimalValue("policyAdminRatePct");
            }}
            className="mt-1 h-11 text-[13px] sm:h-9"
          />
        </div>
      </div>

      {enabled && (
        <>
          <CalcChain
            rows={
              mode === "pct"
                ? [
                    {
                      label: "Valor del contrato",
                      detail: `× ${months} meses`,
                      amount: contractValue,
                    },
                    {
                      label: "Monto garantizado",
                      detail: `× ${pct.toFixed(2).replace(".", ",")}% garantizado`,
                      amount: guaranteed,
                      highlight: true,
                    },
                    {
                      label: "Prima anual",
                      detail: `× ${rate.toFixed(2).replace(".", ",")}% anual ÷ 12`,
                      amount: monthlyPolicy,
                    },
                    {
                      label: "Derechos prorrateados",
                      detail: `× ${admin.toFixed(2).replace(".", ",")}% ÷ ${months} meses`,
                      amount: monthlyAdmin,
                    },
                  ]
                : [
                    {
                      label: "Monto garantizado",
                      detail: `${fixedUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF × valor UF`,
                      amount: guaranteed,
                      highlight: true,
                    },
                    {
                      label: "Prima anual",
                      detail: `× ${rate.toFixed(2).replace(".", ",")}% anual ÷ 12`,
                      amount: monthlyPolicy,
                    },
                    {
                      label: "Derechos prorrateados",
                      detail: `× ${admin.toFixed(2).replace(".", ",")}% ÷ ${months} meses`,
                      amount: monthlyAdmin,
                    },
                  ]
            }
            total={total}
          />
          {warnings.map((w) => (
            <div
              key={w}
              className="rounded-md border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-[12px] text-status-warn-fg"
            >
              {w}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
