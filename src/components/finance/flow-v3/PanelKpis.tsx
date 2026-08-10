"use client";

import { Stat, StatGrid } from "@/components/opai-ds";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import type {
  PanelKpisDerived,
  PanelWeekPoint,
} from "@/modules/finance/flow-v3/insights-series";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 20;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function variantForBalance(
  balance: number | null | undefined,
  buffer: number,
): "ok" | "warn" | "danger" | "default" {
  if (balance == null) return "default";
  if (balance < 0) return "danger";
  if (buffer > 0 && balance < buffer) return "warn";
  return "ok";
}

function runwayVariant(n: number): "ok" | "warn" | "danger" {
  if (n >= 8) return "ok";
  if (n >= 4) return "warn";
  return "danger";
}

export function PanelKpis({
  saldoHoy,
  buffer,
  kpis,
  weeks,
  accounts,
  bankAsOfYmd,
  porCobrarTotal,
  carteraCount,
  overdueClp,
  overduePct,
  onOpenBank,
  onJumpToWeek,
  onOpenCartera,
}: {
  saldoHoy: number | null;
  buffer: number;
  kpis: PanelKpisDerived;
  weeks: PanelWeekPoint[];
  accounts: number;
  bankAsOfYmd: string | null;
  porCobrarTotal: number;
  carteraCount: number;
  overdueClp: number;
  overduePct: number;
  onOpenBank?: () => void;
  onJumpToWeek?: (weekStart: string) => void;
  onOpenCartera?: () => void;
}) {
  const sealedSpark = weeks
    .filter((w) => w.sealed)
    .slice(-6)
    .map((w) => w.balance);

  const breach = kpis.firstBreach;
  const breachVariant =
    breach == null
      ? "ok"
      : breach.type === "negative"
        ? "danger"
        : "warn";

  const weeksAhead = weeks.filter((w) => w.weekStart >= (weeks.find((x) => x.kind === "current")?.weekStart ?? "")).length
    || 12;
  const toNegative = kpis.firstNegative
    ? weeks
        .filter(
          (w) =>
            w.weekStart >= (weeks.find((x) => x.kind === "current")?.weekStart ?? "") &&
            w.weekStart < kpis.firstNegative!.weekStart,
        ).length
    : weeksAhead;

  return (
    <StatGrid cols={2} lgCols={3} className="sm:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="Saldo hoy"
        value={saldoHoy != null ? fmtClp(saldoHoy) : "—"}
        variant="brand"
        hint={
          accounts > 0
            ? `Banco · ${accounts} cuenta${accounts === 1 ? "" : "s"}${
                bankAsOfYmd ? ` · ${fmtDayMonth(bankAsOfYmd)}` : ""
              }`
            : "Sin cuentas bancarias"
        }
        footer={sealedSpark.length >= 2 ? <Sparkline values={sealedSpark} /> : undefined}
        onClick={onOpenBank}
      />
      <Stat
        label="Primer quiebre"
        value={breach ? fmtDayMonth(breach.weekStart) : "—"}
        variant={breachVariant}
        hint={
          breach
            ? `${weekLabelOf(weeks, breach.weekStart)} · ${fmtClp(breach.gapToBuffer)} bajo colchón de ${fmtClp(buffer)}`
            : `Sin quiebres en ${weeksAhead} semanas`
        }
        onClick={
          breach && onJumpToWeek
            ? () => onJumpToWeek(breach.weekStart)
            : undefined
        }
      />
      <Stat
        label="Mínimo 12 sem"
        value={kpis.min12 ? fmtClp(kpis.min12.balance) : "—"}
        variant={variantForBalance(kpis.min12?.balance, buffer)}
        hint={
          kpis.min12
            ? `${weekLabelOf(weeks, kpis.min12.weekStart)} · ${fmtShortDate(kpis.min12.weekStart)} · Δ ${fmtClp(kpis.min12.balance - buffer)}`
            : undefined
        }
        onClick={
          kpis.min12 && onJumpToWeek
            ? () => onJumpToWeek(kpis.min12!.weekStart)
            : undefined
        }
      />
      <Stat
        label="Runway sobre colchón"
        value={`${kpis.runwayWeeks}`}
        variant={runwayVariant(kpis.runwayWeeks)}
        hint={`${toNegative} sem hasta saldo negativo`}
        onClick={
          breach && onJumpToWeek
            ? () => onJumpToWeek(breach.weekStart)
            : kpis.endOfHorizon && onJumpToWeek
              ? () => onJumpToWeek(kpis.endOfHorizon!.weekStart)
              : undefined
        }
      />
      <Stat
        label="Por cobrar"
        value={fmtClp(porCobrarTotal)}
        variant={overduePct > 30 ? "warn" : "default"}
        hint={
          carteraCount > 0
            ? `${carteraCount} F° · ${fmtClp(overdueClp)} vencido (${overduePct}%)`
            : "Sin pendientes"
        }
        onClick={carteraCount > 0 ? onOpenCartera : undefined}
      />
    </StatGrid>
  );
}

function weekLabelOf(weeks: PanelWeekPoint[], weekStart: string): string {
  return weeks.find((w) => w.weekStart === weekStart)?.label ?? weekStart;
}
