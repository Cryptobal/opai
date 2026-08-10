"use client";

import { useState } from "react";
import { Surface } from "@/components/opai-ds";
import { fmtClp, fmtShortDate } from "./format";

type FutureDated = {
  dteId: string;
  folio: number;
  receiverName: string;
  docDateYmd: string;
  sendYmd: string;
  amountClp: number;
};

export function PanelSeals({
  recentSeals,
  canManage,
  futureDated,
  onViewDte,
  onReanchored,
}: {
  recentSeals: Array<{
    weekEnd: string;
    closedBalance: number;
    projectedBalance: number;
    delta: number;
  }>;
  canManage: boolean;
  futureDated: FutureDated[];
  onViewDte?: (dteId: string) => void;
  onReanchored?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <>
      {canManage && futureDated.length > 0 && (
        <Surface
          elevation={1}
          padding="md"
          className="space-y-2 border border-status-warn-border"
        >
          <h3 className="text-xs font-medium uppercase tracking-wide text-status-warn-fg">
            ⚠ Facturas con fecha futura ({futureDated.length})
          </h3>
          <p className="text-[12px] text-ds-text-3">
            Documentos con FchEmis posterior a hoy. La fecha tributaria no se
            puede reescribir (SII). Podés reanclarlas en el flujo a la semana
            del envío real (override reversible). NC + refacturación queda como
            decisión manual.
          </p>
          <ul className="space-y-1 text-[13px]">
            {futureDated.slice(0, 8).map((d) => (
              <li key={d.dteId} className="flex justify-between gap-2">
                <button
                  type="button"
                  className="text-left text-ds-text-1 hover:text-primary"
                  onClick={() => onViewDte?.(d.dteId)}
                >
                  F°{d.folio} · {d.receiverName}
                </button>
                <span className="shrink-0 tabular-nums text-ds-text-3">
                  {fmtShortDate(d.docDateYmd)} · envío {fmtShortDate(d.sendYmd)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            className="min-h-10 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => {
              const n = futureDated.length;
              const total = futureDated.reduce((s, d) => s + d.amountClp, 0);
              if (
                !window.confirm(
                  `Reanclar ${n} factura(s) ($${total.toLocaleString("es-CL")}) a la semana del envío real?\n\nNo toca el documento tributario.`,
                )
              ) {
                return;
              }
              setBusy(true);
              void fetch("/api/finance/flow-v3/reanchor-to-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dteIds: futureDated.map((d) => d.dteId),
                }),
              })
                .then(async (r) => {
                  const j = await r.json();
                  if (!j.success) throw new Error(j.error ?? "Error");
                  onReanchored?.();
                })
                .catch((e: unknown) => {
                  window.alert(e instanceof Error ? e.message : "Error");
                })
                .finally(() => setBusy(false));
            }}
          >
            Reanclar las {futureDated.length} a semana de envío real
          </button>
        </Surface>
      )}

      <Surface elevation={1} padding="md" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Últimos sellos
        </h3>
        {recentSeals.length === 0 ? (
          <p className="text-[13px] text-ds-text-4">Sin cierres aún</p>
        ) : (
          <ul className="ds-list-cascade space-y-2">
            {recentSeals.map((s) => (
              <li
                key={s.weekEnd}
                className="flex items-baseline justify-between gap-2 text-[13px]"
              >
                <span className="text-ds-text-2">{fmtShortDate(s.weekEnd)}</span>
                <span className="tabular-nums text-ds-text-1">
                  {fmtClp(s.closedBalance)}
                </span>
                <span
                  className={`tabular-nums ${
                    s.delta < 0 ? "text-status-danger-fg" : "text-status-ok-fg"
                  }`}
                >
                  Δ {fmtClp(s.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!canManage && (
          <p className="text-[12px] text-ds-text-4">Solo lectura</p>
        )}
      </Surface>
    </>
  );
}
