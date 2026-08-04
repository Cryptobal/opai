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
}

export function PanelView({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carteraOpen, setCarteraOpen] = useState(false);

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
    return () => { cancelled = true; };
  }, []);

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
        onMoved={() => {
          void load().then(() => {
            /* keep sheet open with refreshed list */
          });
        }}
      />
    </div>
  );
}
