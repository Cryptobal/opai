"use client";

import { useState, useTransition, useMemo } from "react";
import { Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import type {
  BalanceSheetResult,
  BalanceSheetSection,
} from "@/modules/finance/reports/shared/types";
import { ExportMenu } from "./ExportMenu";
import { KPICard } from "./shared/KPICard";

interface Props {
  initialAsOf: string;
  initialData: BalanceSheetResult;
  initialCompare?: boolean;
}

const fmtCLP = (n: number): string =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmtCLP(n);
};

function SectionCard({
  section,
  showPrev,
  accent,
}: {
  section: BalanceSheetSection;
  showPrev: boolean;
  accent: string;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--ds-border-soft)" }}>
      <div
        className="text-[11px] font-mono uppercase tracking-wider mb-2"
        style={{ color: accent }}
      >
        {section.label}
      </div>
      {section.items.length === 0 ? (
        <p className="text-[11.5px] text-ds-text-4">Sin movimientos.</p>
      ) : (
        <div className="space-y-1">
          {section.items.map((it) => (
            <div
              key={it.accountId}
              className="flex items-center justify-between text-[12px] py-1"
            >
              <div className="min-w-0 mr-2">
                <p className="text-ds-text-1 truncate">{it.accountName}</p>
                <p className="text-[10px] text-ds-text-4 font-mono">{it.accountCode}</p>
              </div>
              <div className="text-right tabular-nums">
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
        className="flex items-center justify-between pt-2 mt-2 border-t text-[12.5px] font-semibold"
        style={{ borderColor: "var(--ds-border-soft)", color: accent }}
      >
        <span>Total {section.label}</span>
        <span className="tabular-nums">{fmtCLP(section.total)}</span>
      </div>
    </div>
  );
}

export function BalanceSheetClient({ initialAsOf, initialData, initialCompare = true }: Props) {
  const [asOf, setAsOf] = useState(initialAsOf);
  const [data, setData] = useState(initialData);
  const [compare, setCompare] = useState(initialCompare);
  const [, startTransition] = useTransition();

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
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3">
            Fecha de corte
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => refetch(e.target.value, compare)}
            className="h-9 px-2 rounded-lg border text-[12.5px] bg-ds-surface"
            style={{ borderColor: "var(--ds-border)" }}
          />
          <button
            onClick={() => refetch(asOf, !compare)}
            className="h-9 px-3 rounded-lg border text-[12.5px] font-medium"
            style={{
              borderColor: compare ? "var(--ds-tint-violet)" : "var(--ds-border)",
              background: compare
                ? "color-mix(in oklab, var(--ds-tint-violet) 15%, transparent)"
                : "var(--ds-surface)",
              color: compare ? "var(--ds-tint-violet)" : "var(--ds-text-2)",
            }}
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

      <div
        className={`flex items-center gap-2.5 rounded-lg border p-3 text-[12.5px]`}
        style={{
          borderColor: data.isBalanced ? "var(--ds-tint-emerald)" : "var(--ds-tint-amber)",
          background: data.isBalanced
            ? "color-mix(in oklab, var(--ds-tint-emerald) 10%, transparent)"
            : "color-mix(in oklab, var(--ds-tint-amber) 10%, transparent)",
        }}
      >
        {data.isBalanced ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        )}
        <span>
          {data.isBalanced
            ? "Balance cuadrado: Activo = Pasivo + Patrimonio."
            : `Diferencia detectada: ${fmtCLP(data.imbalance)} entre Activo y Pasivo + Patrimonio.`}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total Activo"
          value={fmtCompact(data.asset.total)}
          icon={Scale}
          tone="emerald"
        />
        <KPICard
          label="Total Pasivo"
          value={fmtCompact(data.liability.total)}
          tone="amber"
        />
        <KPICard
          label="Patrimonio"
          value={fmtCompact(data.equity.total)}
          tone="violet"
        />
        <KPICard
          label="Liquidez corriente"
          value={ratios.liquidity.toFixed(2)}
          tone={ratios.liquidity >= 1 ? "emerald" : "rose"}
          sub={ratios.liquidity >= 1 ? "saludable" : "riesgo"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section
          className="rounded-xl border bg-ds-surface p-4 space-y-3"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <h3
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--ds-tint-emerald)" }}
          >
            ACTIVO · {fmtCLP(data.asset.total)}
          </h3>
          <SectionCard
            section={data.asset.current}
            showPrev={!!data.prevAsOf}
            accent="var(--ds-tint-sky)"
          />
          <SectionCard
            section={data.asset.nonCurrent}
            showPrev={!!data.prevAsOf}
            accent="var(--ds-tint-violet)"
          />
        </section>

        <section
          className="rounded-xl border bg-ds-surface p-4 space-y-3"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <h3
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--ds-tint-amber)" }}
          >
            PASIVO + PATRIMONIO · {fmtCLP(data.liability.total + data.equity.total)}
          </h3>
          <SectionCard
            section={data.liability.current}
            showPrev={!!data.prevAsOf}
            accent="var(--ds-tint-rose)"
          />
          <SectionCard
            section={data.liability.nonCurrent}
            showPrev={!!data.prevAsOf}
            accent="var(--ds-tint-amber)"
          />
          <SectionCard
            section={data.equity}
            showPrev={!!data.prevAsOf}
            accent="var(--ds-tint-violet)"
          />
        </section>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          label="Ratio de endeudamiento"
          value={`${(ratios.debtRatio * 100).toFixed(1)}%`}
          tone={ratios.debtRatio < 0.6 ? "emerald" : "amber"}
        />
        <KPICard
          label="Capital de trabajo"
          value={fmtCompact(ratios.workingCapital)}
          tone={ratios.workingCapital >= 0 ? "emerald" : "rose"}
        />
        {data.prevAsOf && (
          <KPICard
            label={`Δ Activo desde ${data.prevAsOf}`}
            value={fmtCompact(data.asset.total - (data.asset.prevTotal ?? 0))}
            tone={data.asset.total >= (data.asset.prevTotal ?? 0) ? "emerald" : "rose"}
          />
        )}
      </div>
    </div>
  );
}
