"use client";

import { useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { dateAtChileSlot } from "../agenda-calendar-utils";
import {
  dayParts,
  monthTitle,
  type AgendaMobileView,
} from "./agenda-mobile-utils";

const VIEWS: Array<{ id: AgendaMobileView; label: string }> = [
  { id: "agenda", label: "Agenda" },
  { id: "day", label: "Día" },
  { id: "month", label: "Mes" },
];

type Props = {
  view: AgendaMobileView;
  selectedYmd: string;
  daysWithEvents: Set<string>;
  filterCount: number;
  onViewChange: (view: AgendaMobileView) => void;
  onSelectDate: (ymd: string) => void;
  onToday: () => void;
  onOpenFilters: () => void;
};

/** Header compacto sticky (spec §1): título, segmented y tira de fechas. */
export function AgendaMobileHeader({
  view,
  selectedYmd,
  daysWithEvents,
  filterCount,
  onViewChange,
  onSelectDate,
  onToday,
  onOpenFilters,
}: Props) {
  const { month, year } = monthTitle(selectedYmd);
  const today = todayInChile();
  const stripRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Publica la altura real del header para los day-headers sticky de la lista.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--agenda-mobile-header-h",
        `${el.offsetHeight}px`,
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--agenda-mobile-header-h");
    };
  }, []);

  // Tira: 3 días atrás → 18 adelante, centrada en la fecha seleccionada.
  const stripDays: string[] = [];
  const base = dateAtChileSlot(selectedYmd, 12 * 60);
  for (let i = -3; i <= 18; i++) stripDays.push(ymdInChile(addDaysChile(base, i)));

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedYmd, view]);

  return (
    <header
      ref={headerRef}
      className="opai-glass-strong sticky top-0 z-30 rounded-b-[26px] rounded-t-none px-3 pb-2 pt-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[19px] font-semibold leading-tight text-ds-text-1">
          {month}{" "}
          <span className="font-mono text-[12px] font-normal text-ds-text-3">{year}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToday}
            className="h-11 rounded-xl border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-2 ds-tap"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label="Filtros"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-ds-border-default text-ds-text-2 ds-tap"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[12px] font-semibold text-primary-foreground">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-0.5 rounded-full bg-ds-surface-2 p-0.5">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onViewChange(option.id)}
            className={cn(
              "h-11 flex-1 rounded-full text-[13px] font-medium transition-colors ds-tap",
              view === option.id
                ? "bg-ds-surface-1 text-ds-text-1 shadow-ds-xs"
                : "text-ds-text-3",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "agenda" && (
        <div
          ref={stripRef}
          className="mt-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {stripDays.map((ymd) => {
            const { weekday, day } = dayParts(ymd);
            const selected = ymd === selectedYmd;
            const isToday = ymd === today;
            return (
              <button
                key={ymd}
                type="button"
                data-selected={selected}
                onClick={() => onSelectDate(ymd)}
                className={cn(
                  "flex h-[58px] w-[46px] shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-[16px] ds-tap",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                      ? "border border-primary/50 text-ds-text-1"
                      : "opai-glass-soft text-ds-text-2",
                )}
              >
                <span className="text-[12px] uppercase leading-none">{weekday}</span>
                <span className="font-mono text-[15px] font-semibold leading-none">{day}</span>
                <span
                  className={cn(
                    "h-1 w-1 rounded-full",
                    daysWithEvents.has(ymd)
                      ? selected
                        ? "bg-primary-foreground"
                        : "bg-primary"
                      : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
