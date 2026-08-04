"use client";

import { cn } from "@/lib/utils";
import type { AllocationRailStatus, LocalLink } from "./types";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const SEGMENT_TONES = [
  "bg-status-info",
  "bg-status-ok",
  "bg-primary",
  "bg-status-warn",
  "bg-status-danger",
] as const;

export interface AllocationRailProps {
  links: LocalLink[];
  txAmountAbs: number;
  linksTotal: number;
  remaining: number;
  overflow: number;
  onOpenDetail: () => void;
}

function resolveStatus(
  linksCount: number,
  remaining: number,
  overflow: number,
): AllocationRailStatus {
  if (linksCount === 0) return "vacio";
  if (overflow > 1) return "excede";
  if (remaining > 0.01) return "falta";
  return "calza";
}

export function AllocationRail({
  links,
  txAmountAbs,
  linksTotal,
  remaining,
  overflow,
  onOpenDetail,
}: AllocationRailProps) {
  const status = resolveStatus(links.length, remaining, overflow);
  const assignedPct =
    txAmountAbs > 0
      ? Math.min(100, Math.round((linksTotal / txAmountAbs) * 100))
      : 0;

  const statusLabel =
    status === "vacio"
      ? "Sin asignar"
      : status === "calza"
        ? "Calza"
        : status === "excede"
          ? `Excede ${fmtCLP.format(overflow)}`
          : `Falta ${fmtCLP.format(remaining)}`;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={cn(
        "w-full rounded-xl border border-ds-border-default bg-ds-surface-1 p-3 text-left",
        "min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "hover:bg-ds-surface-2 transition-colors",
      )}
      aria-label="Abrir detalle de asignación"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
            Asignación
          </p>
          <p className="text-[13px] text-ds-text-1 font-medium tabular-nums">
            {fmtCLP.format(linksTotal)}
            <span className="text-ds-text-3 font-normal">
              {" "}
              / {fmtCLP.format(txAmountAbs)}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium",
              status === "calza" &&
                "bg-status-ok-soft text-status-ok-fg border border-status-ok-border",
              status === "falta" &&
                "bg-status-warn-soft text-status-warn-fg border border-status-warn-border",
              status === "excede" &&
                "bg-status-danger-soft text-status-danger-fg border border-status-danger-border",
              status === "vacio" &&
                "bg-ds-surface-2 text-ds-text-3 border border-ds-border-subtle",
            )}
          >
            {statusLabel}
          </span>
          <p className="text-[12px] text-ds-text-3 mt-0.5">
            {links.length} vínculo{links.length === 1 ? "" : "s"} · ver detalle
          </p>
        </div>
      </div>

      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-ds-surface-2 border border-ds-border-subtle"
        aria-hidden
      >
        <div className="absolute inset-0 flex">
          {links.map((l, i) => {
            const pct =
              txAmountAbs > 0
                ? Math.max(0, (l.amount / txAmountAbs) * 100)
                : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={l.key}
                className={cn(
                  "h-full",
                  SEGMENT_TONES[i % SEGMENT_TONES.length],
                )}
                style={{ width: `${pct}%` }}
              />
            );
          })}
          {status === "falta" && remaining > 0 && (
            <div
              className="h-full bg-status-warn-soft"
              style={{
                width: `${Math.max(0, 100 - assignedPct)}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 3px, hsl(var(--ds-warn-border)) 3px, hsl(var(--ds-warn-border)) 6px)",
              }}
            />
          )}
          {status === "excede" && (
            <div
              className="h-full bg-status-danger-soft"
              style={{
                width: "8%",
                marginLeft: "auto",
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 3px, hsl(var(--ds-danger-border)) 3px, hsl(var(--ds-danger-border)) 6px)",
              }}
            />
          )}
        </div>
      </div>
    </button>
  );
}
