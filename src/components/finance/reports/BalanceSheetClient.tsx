"use client";

import { useState, useTransition, useMemo } from "react";
import { Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import type {
  BalanceSheetResult,
  BalanceSheetSection,
} from "@/modules/finance/reports/shared/types";
import { KPICard, KPIGrid, Surface, SectionHeader } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { ExportMenu } from "./ExportMenu";

interface Props {
  initialAsOf: string;
  initialData: BalanceSheetResult;
  initialCompare?: boolean;
}

const fmtCLP = (n: number): string =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}MM`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
};

function SubSection({
  section,
  showPrev,
  accentClass,
}: {
  section: BalanceSheetSection;
  showPrev: boolean;
  accentClass: string;
}) {
  return (
    <div>
      <div className={cn("text-[11px] font-mono uppercase tracking-wider mb-2", accentClass)}>
        {section.label}
      </div>
      {section.items.length === 0 ? (
        <p className="text-[11.5px] text-ds-text-4">Sin movimientos.</p>
      ) : (
        <div className="space-y-1">
          {section.items.map((it) => (
            <div
              key={it.accountId}
              className="flex items-center justify-between text-sm py-1"
            >
              <div className="min-w-0 mr-2">
                <p className="text-ds-text-1 truncate">{it.accountName}</p>
                <p className="text-[10px] text-ds-text-4 font-mono">{it.accountCode}</p>
              </div>
              <div className="text-right ds-num shrink-0">
                {showPrev && (
                  <p className="text-[10.5px] text-ds-text-4">
                    {fmtCLP(it.prevAmount ?? 0)}
                  </p>
                )}
                <p className="text-ds-text-1">{fmtCLP(it.amount)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-between pt-2 mt-2 border-t border-ds-border-subtle text-sm font-semibold",
          accentClass
        )}
      >
        <span>Total {section.label}</span>
        <span className="ds-num">{fmtCLP(section.total)}</span>
      </div>
    </div>
  );
}

export function BalanceSheetClient({ initialAsOf, initialData, initialCompare = true }: Props) {
  const [asOf, setAsOf] = useState(initialAsOf);
  const [data, setData] = useState(initialData);
  const [compare, setCompare] = useState(initialCompare);
  const [isPending, startTransition] = useTransition();

  const refetch = (newAsOf: string, withPriorMonth: boolean) => {
    setAsOf(newAsOf);
    setCompare(withPriorMonth);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/balance-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOf: newAsOf, filters: {}, withPriorMonth }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const ratios = useMemo(() => {
    const liquidity =
      data.liability.current.total > 0
        ? data.asset.current.total / data.liability.current.total
        : 0;
    const debtRatio =
      data.asset.total > 0 ? data.liability.total / data.asset.total : 0;
    const workingCapital = data.asset.current.total - data.liability.current.total;
    return { liquidity, debtRatio, workingCapital };
  }, [data]);

  return (
    <div className={cn("space-y-5", isPending && "opacity-70")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3">
            Fecha de corte
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => refetch(e.target.value, compare)}
            className="h-9 px-2 rounded-ds-md border border-ds-border-default text-sm bg-ds-surface"
          />
          <button
            onClick={() => refetch(asOf, !compare)}
            className={cn(
              "h-9 px-3 rounded-ds-md border text-sm font-medium transition-colors",
              compare
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-ds-border-default bg-ds-surface text-ds-text-2 hover:bg-ds-surface-2"
            )}
          >
            vs. cierre mes anterior
          </button>
        </div>
        <ExportMenu
          endpoint="/api/finance/reports/balance-sheet/export"
          payload={{ asOf, filters: {}, withPriorMonth: compare }}
          filenameBase={`balance-${asOf}`}
        />
      </div>

      <Surface
        padding="md"
        elevation={1}
        accent={data.isBalanced ? "ok" : "warn"}
        className="flex items-center gap-2.5"
      >
        {data.isBalanced ? (
          <CheckCircle2 className="w-4 h-4 text-status-ok-fg shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-status-warn-fg shrink-0" />
        )}
        <span className="text-sm">
          {data.isBalanced
            ? "Balance cuadrado: Activo = Pasivo + Patrimonio."
            : `Diferencia detectada: ${fmtCLP(data.imbalance)} entre Activo y Pasivo + Patrimonio.`}
        </span>
      </Surface>

      <KPIGrid>
        <KPICard
          label="Total Activo"
          value={<span title={fmtCLP(data.asset.total)}>{fmtCLPShort(data.asset.total)}</span>}
          icon={Scale}
          iconTone="emerald"
          variant="ok"
        />
        <KPICard
          label="Total Pasivo"
          value={<span title={fmtCLP(data.liability.total)}>{fmtCLPShort(data.liability.total)}</span>}
          iconTone="amber"
          variant="warn"
        />
        <KPICard
          label="Patrimonio"
          value={<span title={fmtCLP(data.equity.total)}>{fmtCLPShort(data.equity.total)}</span>}
          iconTone="violet"
          variant="brand"
        />
        <KPICard
          label="Liquidez corriente"
          value={ratios.liquidity.toFixed(2)}
          hint={ratios.liquidity >= 1 ? "saludable" : "riesgo"}
          variant={ratios.liquidity >= 1 ? "ok" : "danger"}
        />
      </KPIGrid>

      <div className="grid lg:grid-cols-2 gap-4">
        <Surface padding="lg" elevation={1}>
          <SectionHeader
            eyebrow={fmtCLPShort(data.asset.total)}
            title="Activo"
            size="md"
          />
          <div className="space-y-4 mt-3">
            <SubSection
              section={data.asset.current}
              showPrev={!!data.prevAsOf}
              accentClass="text-status-info-fg"
            />
            <SubSection
              section={data.asset.nonCurrent}
              showPrev={!!data.prevAsOf}
              accentClass="text-tint-violet-fg"
            />
          </div>
        </Surface>

        <Surface padding="lg" elevation={1}>
          <SectionHeader
            eyebrow={fmtCLPShort(data.liability.total + data.equity.total)}
            title="Pasivo + Patrimonio"
            size="md"
          />
          <div className="space-y-4 mt-3">
            <SubSection
              section={data.liability.current}
              showPrev={!!data.prevAsOf}
              accentClass="text-status-danger-fg"
            />
            <SubSection
              section={data.liability.nonCurrent}
              showPrev={!!data.prevAsOf}
              accentClass="text-status-warn-fg"
            />
            <SubSection
              section={data.equity}
              showPrev={!!data.prevAsOf}
              accentClass="text-tint-violet-fg"
            />
          </div>
        </Surface>
      </div>

      <KPIGrid lgCols={3}>
        <KPICard
          label="Ratio de endeudamiento"
          value={`${(ratios.debtRatio * 100).toFixed(1)}%`}
          variant={ratios.debtRatio < 0.6 ? "ok" : "warn"}
        />
        <KPICard
          label="Capital de trabajo"
          value={
            <span title={fmtCLP(ratios.workingCapital)}>
              {fmtCLPShort(ratios.workingCapital)}
            </span>
          }
          variant={ratios.workingCapital >= 0 ? "ok" : "danger"}
        />
        {data.prevAsOf && (
          <KPICard
            label={`Δ Activo desde ${data.prevAsOf}`}
            value={
              <span
                title={fmtCLP(data.asset.total - (data.asset.prevTotal ?? 0))}
              >
                {fmtCLPShort(data.asset.total - (data.asset.prevTotal ?? 0))}
              </span>
            }
            variant={data.asset.total >= (data.asset.prevTotal ?? 0) ? "ok" : "danger"}
          />
        )}
      </KPIGrid>
    </div>
  );
}
