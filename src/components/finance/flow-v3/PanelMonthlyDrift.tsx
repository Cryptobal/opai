"use client";

import { useState } from "react";
import { Surface, Tag } from "@/components/opai-ds";
import { fmtClp } from "./format";
import type { MonthlyDriftRowV2 } from "@/modules/finance/flow-v3/insights-drift";

export function PanelMonthlyDrift({
  rows,
  onSelectCell,
}: {
  rows: MonthlyDriftRowV2[];
  onSelectCell?: (rowId: string, monthKey: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.filter((r) => !r.allZero);
  if (rows.length === 0) return null;

  const monthKeys = rows[0]?.months ?? [];
  const currentMeta = monthKeys.find((m) => m.partial);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
            Desviaciones mensuales
          </h3>
          <p className="text-[12px] text-ds-text-4">
            Totales de mes · proyectado no ejecutado también cuenta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentMeta && (
            <Tag size="sm" variant="info">
              Mes en curso · {currentMeta.weeksElapsed} de{" "}
              {currentMeta.weeksTotal} semanas
            </Tag>
          )}
          <button
            type="button"
            className="min-h-10 rounded-full px-3 text-[12px] text-ds-text-3 hover:bg-ds-surface-2 sm:min-h-9"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Ocultar ceros" : "Mostrar todas"}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-[13px] text-ds-text-4">
          Todas las filas en cero.{" "}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => setShowAll(true)}
          >
            Mostrar todas
          </button>
        </p>
      ) : (
        <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-0 sm:min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ds-border-subtle text-[12px] text-ds-text-4">
                  <th className="py-1.5 pr-2 font-medium">Fila</th>
                  {monthKeys.map((m) => (
                    <th
                      key={m.monthKey}
                      className="px-1 py-1.5 font-medium tabular-nums"
                    >
                      {m.monthKey}
                      {m.partial ? " *" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.rowId}
                    className="border-b border-ds-border-subtle/60"
                  >
                    <td className="py-2 pr-2">
                      <span className="text-ds-text-1">{row.name}</span>
                      {row.canonicalKey && (
                        <span className="mt-0.5 block text-[12px] text-ds-text-4">
                          {row.canonicalKey}
                        </span>
                      )}
                    </td>
                    {row.months.map((m) => (
                      <td key={m.monthKey} className="px-1 py-2 align-top">
                        <button
                          type="button"
                          className="w-full rounded-md px-0.5 text-left hover:bg-ds-surface-2"
                          onClick={() =>
                            onSelectCell?.(row.rowId, m.monthKey)
                          }
                          disabled={!onSelectCell}
                        >
                          <div className="tabular-nums text-ds-text-3 text-[12px]">
                            P {fmtClp(m.projected)}
                            {m.partial ? " a la fecha" : ""}
                          </div>
                          <div className="tabular-nums text-ds-text-2 text-[12px]">
                            R {fmtClp(m.real)}
                          </div>
                          <div
                            className={`tabular-nums text-[12px] ${
                              m.delta === 0
                                ? "text-ds-text-4"
                                : m.delta > 0
                                  ? "text-status-ok-fg"
                                  : "text-status-danger-fg"
                            }`}
                          >
                            {m.delta > 0 ? "▲" : m.delta < 0 ? "▼" : "·"}{" "}
                            {fmtClp(Math.abs(m.delta))}
                            {m.pct != null ? ` (${m.pct}%)` : ""}
                          </div>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 sm:hidden ds-list-cascade">
            {visible.map((row) => (
              <li
                key={row.rowId}
                className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3"
              >
                <p className="mb-0.5 text-[13px] font-medium text-ds-text-1">
                  {row.name}
                </p>
                {row.canonicalKey && (
                  <p className="mb-2 text-[12px] text-ds-text-4">
                    {row.canonicalKey}
                  </p>
                )}
                <div className="space-y-2">
                  {row.months.map((m) => (
                    <button
                      key={m.monthKey}
                      type="button"
                      className="flex w-full min-h-10 items-baseline justify-between gap-2 text-[12px] text-left"
                      onClick={() => onSelectCell?.(row.rowId, m.monthKey)}
                      disabled={!onSelectCell}
                    >
                      <span className="text-ds-text-4 tabular-nums">
                        {m.monthKey}
                        {m.partial ? " *" : ""}
                      </span>
                      <span className="text-right">
                        <span className="block tabular-nums text-ds-text-3">
                          P {fmtClp(m.projected)}
                          {m.partial ? " a la fecha" : ""} · R {fmtClp(m.real)}
                        </span>
                        <span
                          className={`tabular-nums ${
                            m.delta === 0
                              ? "text-ds-text-4"
                              : m.delta > 0
                                ? "text-status-ok-fg"
                                : "text-status-danger-fg"
                          }`}
                        >
                          {m.delta > 0 ? "▲" : m.delta < 0 ? "▼" : "·"}{" "}
                          {fmtClp(Math.abs(m.delta))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Surface>
  );
}
