"use client";

import { Tag } from "@/components/opai-ds";
import { fmtClp, fmtDayMonth } from "./format";
import type { PanelWeekPoint } from "@/modules/finance/flow-v3/insights-series";

export type ChartPoint = PanelWeekPoint & {
  balanceReal: number | null;
  balanceProj: number | null;
  /** Saldo al inicio de la semana (cierre anterior). */
  opening: number;
  /** Magnitud de egresos para barras (siempre ≥ 0). */
  outflowBar?: number;
}

function kindLabel(kind: PanelWeekPoint["kind"]): string {
  if (kind === "sealed") return "Sellada";
  if (kind === "current") return "Semana actual";
  if (kind === "past") return "Histórico";
  return "Proyectada";
}

function thresholdChip(
  balance: number,
  buffer: number,
): { label: string; variant: "ok" | "warn" | "danger" } {
  if (balance < 0) return { label: "Negativo", variant: "danger" };
  if (buffer > 0 && balance < buffer) {
    return { label: "Bajo colchón", variant: "warn" };
  }
  return { label: "Sobre colchón", variant: "ok" };
}

/** Contenido del Tooltip de recharts para una semana del Panel. */
export function PanelBalanceTooltip({
  active,
  payload,
  buffer,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  buffer: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const thr = thresholdChip(p.balance, buffer);
  const vsBuffer = buffer > 0 ? p.balance - buffer : p.balance;

  return (
    <div className="min-w-[200px] max-w-[260px] rounded-lg border border-ds-border-default bg-ds-surface-1 p-2.5 shadow-md">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <p className="text-[13px] font-medium text-ds-text-1">
          {p.label}{" "}
          <span className="font-normal text-ds-text-3">
            · {fmtDayMonth(p.weekStart)}–{fmtDayMonth(p.weekEnd)}
          </span>
        </p>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        <Tag size="sm" variant="neutral">
          {kindLabel(p.kind)}
        </Tag>
        <Tag size="sm" variant={thr.variant}>
          {thr.label}
        </Tag>
        {p.sealed && (
          <Tag size="sm" variant="info">
            Sello
          </Tag>
        )}
        {p.breakDelta != null && (
          <Tag size="sm" variant="warn">
            Sellos
          </Tag>
        )}
      </div>
      <dl className="space-y-1 text-[12px]">
        <Row label="Saldo inicial" value={fmtClp(p.opening)} />
        <Row label="Ingresos" value={fmtClp(p.inflow)} tone="ok" />
        <Row label="Egresos" value={fmtClp(p.outflow)} tone="danger" />
        <Row label="Neto semana" value={fmtClp(p.net)} />
        <Row label="Saldo final" value={fmtClp(p.balance)} strong />
        {buffer > 0 && (
          <Row
            label="vs colchón"
            value={`${vsBuffer >= 0 ? "+" : ""}${fmtClp(vsBuffer)}`}
            tone={vsBuffer >= 0 ? "ok" : "warn"}
          />
        )}
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
  strong?: boolean;
}) {
  const color =
    tone === "ok"
      ? "text-status-ok-fg"
      : tone === "warn"
        ? "text-status-warn-fg"
        : tone === "danger"
          ? "text-status-danger-fg"
          : strong
            ? "text-ds-text-1"
            : "text-ds-text-2";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ds-text-4">{label}</dt>
      <dd className={`tabular-nums ${color} ${strong ? "font-medium" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
