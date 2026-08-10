"use client";

import { Surface } from "@/components/opai-ds";
import { fmtClp } from "./format";
import type { PanelTopMovers as Movers } from "@/modules/finance/flow-v3/insights-series";

export function PanelTopMovers({
  movers,
  onSelectRow,
}: {
  movers: Movers;
  onSelectRow?: (rowId: string) => void;
}) {
  if (movers.inflow.length === 0 && movers.outflow.length === 0) {
    return null;
  }

  const maxOut = Math.max(...movers.outflow.map((m) => m.amount), 1);
  const maxIn = Math.max(...movers.inflow.map((m) => m.amount), 1);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Qué mueve el saldo
        </h3>
        <p className="text-[12px] text-ds-text-4">
          Próximas {movers.horizonWeeks} semanas · proyectado
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoverList
          title="Mayores egresos"
          items={movers.outflow}
          max={maxOut}
          tone="danger"
          onSelectRow={onSelectRow}
        />
        <MoverList
          title="Mayores ingresos"
          items={movers.inflow}
          max={maxIn}
          tone="ok"
          onSelectRow={onSelectRow}
        />
      </div>
    </Surface>
  );
}

function MoverList({
  title,
  items,
  max,
  tone,
  onSelectRow,
}: {
  title: string;
  items: Array<{ rowId: string; name: string; amount: number }>;
  max: number;
  tone: "ok" | "danger";
  onSelectRow?: (rowId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div>
        <p className="mb-1 text-[12px] text-ds-text-4">{title}</p>
        <p className="text-[13px] text-ds-text-4">Sin movimientos</p>
      </div>
    );
  }
  const bar =
    tone === "ok" ? "bg-status-ok" : "bg-status-danger";
  const text =
    tone === "ok" ? "text-status-ok-fg" : "text-status-danger-fg";

  return (
    <div>
      <p className="mb-2 text-[12px] text-ds-text-4">{title}</p>
      <ul className="space-y-2">
        {items.map((m) => {
          const pct = Math.max(4, Math.round((m.amount / max) * 100));
          return (
            <li key={m.rowId}>
              <button
                type="button"
                className="group flex w-full min-h-10 flex-col gap-1 rounded-lg px-1 text-left hover:bg-ds-surface-2 sm:min-h-9"
                onClick={() => onSelectRow?.(m.rowId)}
                disabled={!onSelectRow}
              >
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ds-text-1">{m.name}</span>
                  <span className={`shrink-0 tabular-nums ${text}`}>
                    {fmtClp(m.amount)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ds-surface-3">
                  <div
                    className={`h-full rounded-full ${bar} opacity-70`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
