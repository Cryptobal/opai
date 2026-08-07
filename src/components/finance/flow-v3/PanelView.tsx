"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Surface, Stat, StatGrid, Spinner, EmptyState } from "@/components/opai-ds";
import { fmtClp, fmtShortDate } from "./format";
import { PanelBalanceChart } from "./PanelBalanceChart";
import {
  CarteraPendienteSheet,
  type CarteraItem,
  type OpenMoveWeek,
} from "./CarteraPendienteSheet";

interface Insights {
  saldoHoy: number | null;
  redWeek: { weekStart: string; balance: number } | null;
  min12: { weekStart: string; balance: number } | null;
  porCobrarTotal: number;
  aging: { alDia: number; d1_15: number; d16_30: number; d30plus: number };
  cartera: CarteraItem[];
  openMoveWeeks: OpenMoveWeek[];
  balanceSeries: Array<{ weekStart: string; label: string; balance: number }>;
  recentSeals: Array<{
    weekEnd: string;
    closedBalance: number;
    projectedBalance: number;
    delta: number;
  }>;
  warnThresholdClp: number;
  monthlyDrifts?: Array<{
    rowId: string;
    name: string;
    months: Array<{
      monthKey: string;
      projected: number;
      real: number;
      delta: number;
    }>;
  }>;
}

export function PanelView({
  canManage,
  onViewDte,
}: {
  canManage: boolean;
  onViewDte?: (dteId: string) => void;
}) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carteraOpen, setCarteraOpen] = useState(false);
  const [reanchorBusy, setReanchorBusy] = useState(false);
  const [futureDated, setFutureDated] = useState<Array<{
    dteId: string;
    folio: number;
    receiverName: string;
    docDateYmd: string;
    sendYmd: string;
    amountClp: number;
  }>>([]);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/finance/flow-v3/insights", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        setData(j.data as Insights);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/finance/flow-v3/insights", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        if (!cancelled) setData(j.data as Insights);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    if (canManage) {
      void fetch("/api/finance/flow-v3/reanchor-to-send", { cache: "no-store" })
        .then(async (r) => {
          const j = await r.json();
          if (j.success && !cancelled) setFutureDated(j.data ?? []);
        })
        .catch(() => { /* no-op */ });
    }
    return () => { cancelled = true; };
  }, [canManage]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No se pudo cargar el panel"
        description={error ?? "Sin datos"}
      />
    );
  }

  const a = data.aging;
  const cartera = data.cartera ?? [];
  const openMoveWeeks = data.openMoveWeeks ?? [];

  return (
    <div className="ds-page-enter space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <StatGrid>
        <Stat
          label="Semana en rojo"
          value={data.redWeek ? fmtClp(data.redWeek.balance) : "—"}
          hint={data.redWeek ? fmtShortDate(data.redWeek.weekStart) : "Sin alerta"}
        />
        <Stat
          label="Saldo hoy"
          value={data.saldoHoy != null ? fmtClp(data.saldoHoy) : "—"}
        />
        <Stat
          label="Mínimo 12 sem"
          value={data.min12 ? fmtClp(data.min12.balance) : "—"}
          hint={data.min12 ? fmtShortDate(data.min12.weekStart) : undefined}
        />
        <Stat
          label="Por cobrar"
          value={fmtClp(data.porCobrarTotal)}
          hint={
            cartera.length > 0
              ? `${cartera.length} F° · tocar para listar`
              : "Sin pendientes"
          }
          onClick={
            cartera.length > 0 ? () => setCarteraOpen(true) : undefined
          }
        />
      </StatGrid>

      <Surface elevation={1} padding="md" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Aging por cobrar (desde emisión)
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Al día", a.alDia],
            ["1–15", a.d1_15],
            ["16–30", a.d16_30],
            ["+30", a.d30plus],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-lg bg-ds-surface-2 px-3 py-2">
              <p className="text-[12px] text-ds-text-4">{label}</p>
              <p className="tabular-nums text-ds-text-1">{fmtClp(Number(v))}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface elevation={1} padding="md">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Saldo proyectado · 12 semanas
        </h3>
        <PanelBalanceChart series={data.balanceSeries} warn={data.warnThresholdClp} />
      </Surface>

      {(data.monthlyDrifts?.length ?? 0) > 0 && (
        <Surface elevation={1} padding="md" className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
            Desviaciones mensuales
          </h3>
          <p className="text-[12px] text-ds-text-4">
            Proyectado vs real (últimos 3 meses + actual) · filas clave
          </p>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-0 sm:min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ds-border-subtle text-[12px] text-ds-text-4">
                  <th className="py-1.5 pr-2 font-medium">Fila</th>
                  {(data.monthlyDrifts![0]?.months ?? []).map((m) => (
                    <th key={m.monthKey} className="px-1 py-1.5 font-medium tabular-nums">
                      {m.monthKey}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.monthlyDrifts!.map((row) => (
                  <tr key={row.rowId} className="border-b border-ds-border-subtle/60">
                    <td className="py-2 pr-2 text-ds-text-1">{row.name}</td>
                    {row.months.map((m) => (
                      <td key={m.monthKey} className="px-1 py-2 align-top">
                        <div className="tabular-nums text-ds-text-3 text-[12px]">
                          P {fmtClp(m.projected)}
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
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked */}
          <ul className="space-y-3 sm:hidden ds-list-cascade">
            {data.monthlyDrifts!.map((row) => (
              <li
                key={row.rowId}
                className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3"
              >
                <p className="mb-2 text-[13px] font-medium text-ds-text-1">{row.name}</p>
                <div className="space-y-2">
                  {row.months.map((m) => (
                    <div
                      key={m.monthKey}
                      className="flex items-baseline justify-between gap-2 text-[12px]"
                    >
                      <span className="text-ds-text-4 tabular-nums">{m.monthKey}</span>
                      <span className="text-right">
                        <span className="block tabular-nums text-ds-text-3">
                          P {fmtClp(m.projected)} · R {fmtClp(m.real)}
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
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {canManage && futureDated.length > 0 && (
        <Surface elevation={1} padding="md" className="space-y-2 border border-status-warn-border">
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
            disabled={reanchorBusy}
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
              setReanchorBusy(true);
              void fetch("/api/finance/flow-v3/reanchor-to-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dteIds: futureDated.map((d) => d.dteId) }),
              })
                .then(async (r) => {
                  const j = await r.json();
                  if (!j.success) throw new Error(j.error ?? "Error");
                  setFutureDated([]);
                  void load();
                })
                .catch((e: unknown) => {
                  window.alert(e instanceof Error ? e.message : "Error");
                })
                .finally(() => setReanchorBusy(false));
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
        {data.recentSeals.length === 0 ? (
          <p className="text-[13px] text-ds-text-4">Sin cierres aún</p>
        ) : (
          <ul className="ds-list-cascade space-y-2">
            {data.recentSeals.map((s) => (
              <li
                key={s.weekEnd}
                className="flex items-baseline justify-between gap-2 text-[13px]"
              >
                <span className="text-ds-text-2">{fmtShortDate(s.weekEnd)}</span>
                <span className="tabular-nums text-ds-text-1">{fmtClp(s.closedBalance)}</span>
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

      <CarteraPendienteSheet
        open={carteraOpen}
        onOpenChange={setCarteraOpen}
        items={cartera}
        openMoveWeeks={openMoveWeeks}
        canManage={canManage}
        onViewDte={onViewDte}
        onMoved={() => {
          void load().then(() => {
            /* keep sheet open with refreshed list */
          });
        }}
      />
    </div>
  );
}
