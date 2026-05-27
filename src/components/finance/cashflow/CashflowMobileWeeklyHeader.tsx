"use client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

interface Props {
  prev: ProjectionBucket | null;
  active: ProjectionBucket | null;
  next: ProjectionBucket | null;
}

function shortDate(d: Date): string {
  return format(d, "d MMM", { locale: es });
}

function weekNum(d: Date): string {
  return format(d, "w", { locale: es });
}

function monthLabel(active: ProjectionBucket | null): string {
  if (!active) return "";
  return format(active.start, "MMM ''yy", { locale: es }).toUpperCase();
}

export function CashflowMobileWeeklyHeader({ prev, active, next }: Props) {
  return (
    <div
      className="sticky z-20 bg-card border-b border-border"
      style={{ top: "calc(3rem + env(safe-area-inset-top, 0px))" }}
    >
      <div
        className="grid items-stretch"
        style={{ gridTemplateColumns: "minmax(0, 1.5fr) repeat(3, minmax(0, 1fr))" }}
      >
        <div />
        <div className="col-span-3 text-center py-1 text-[10px] font-semibold text-status-info-fg bg-status-info-bg/20 tracking-[0.06em]">
          {monthLabel(active)}
        </div>
        <div className="px-2 py-1.5 text-[10px] text-ds-text-3 font-medium self-end">
          Categoría
        </div>
        {[prev, active, next].map((b, i) => {
          const isActive = i === 1;
          if (!b) return <div key={`empty-${i}`} />;
          return (
            <div
              key={b.key}
              className={`text-right py-1.5 px-1.5 ${
                isActive
                  ? "bg-status-info-bg/20 outline outline-1 -outline-offset-1 outline-status-info-fg/60"
                  : ""
              }`}
            >
              <div className={`text-[10px] font-semibold ${isActive ? "text-status-info-fg" : "text-ds-text-3"}`}>
                Sem {weekNum(b.start)}
              </div>
              <div className={`text-[9px] ${isActive ? "text-status-info-fg" : "text-ds-text-3"}`}>
                {shortDate(b.start)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
