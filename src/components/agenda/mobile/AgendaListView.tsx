"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { addDaysChile, ymdInChile } from "@/lib/dates-cl";
import { agendaItemDayKey, dateAtChileSlot } from "../agenda-calendar-utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";
import { listDayLabel } from "./agenda-mobile-utils";
import { AgendaListRow } from "./AgendaListRow";

type Props = {
  selectedYmd: string;
  items: AgendaCalendarItem[];
  colorBySource?: Record<string, string>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (item: AgendaCalendarItem) => void;
  onChanged: () => void;
  onCreateAt: (ymd: string) => void;
};

/** Vista Agenda móvil (spec §2): lista cronológica agrupada por día. */
export function AgendaListView({
  selectedYmd,
  items,
  colorBySource,
  loading,
  error,
  onRetry,
  onSelect,
  onChanged,
  onCreateAt,
}: Props) {
  const days = useMemo(() => {
    const base = dateAtChileSlot(selectedYmd, 12 * 60);
    return Array.from({ length: 7 }, (_, i) => ymdInChile(addDaysChile(base, i)));
  }, [selectedYmd]);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCalendarItem[]>();
    for (const day of days) map.set(day, []);
    for (const item of items) {
      const key = agendaItemDayKey(item);
      map.get(key)?.push(item);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [days, items]);

  if (loading) {
    return (
      <div className="space-y-2 px-1 pt-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="opai-glass-soft h-16 animate-pulse rounded-[18px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-10 text-center">
        <p className="text-ds-body text-ds-text-3">No pudimos cargar tu agenda.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-11 rounded-xl bg-primary px-4 text-ds-body font-semibold text-primary-foreground ds-tap"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="ds-page-enter space-y-1 pb-28 pt-1">
      {days.map((ymd) => {
        const dayItems = byDay.get(ymd) ?? [];
        return (
          <section key={ymd}>
            <div
              className="sticky z-10 -mx-1 px-1"
              style={{
                top: "calc(env(safe-area-inset-top) + 4rem + var(--agenda-mobile-header-h, 150px))",
              }}
            >
              <div className="flex items-center gap-2 bg-background py-1.5">
                <p
                  className={
                    ymd === days[0] && listDayLabel(ymd).startsWith("HOY")
                      ? "text-[12px] font-semibold uppercase tracking-wide text-primary"
                      : "text-[12px] font-medium uppercase tracking-wide text-ds-text-3"
                  }
                >
                  {listDayLabel(ymd)}
                </p>
                <div className="h-px flex-1 bg-ds-border-subtle" />
              </div>
            </div>
            {dayItems.length === 0 ? (
              <div className="flex items-center justify-between rounded-[18px] border border-dashed border-ds-border-default px-3 py-2.5">
                <span className="text-ds-body text-ds-text-4">Día libre</span>
                <button
                  type="button"
                  onClick={() => onCreateAt(ymd)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-ds-body font-medium text-primary ds-tap"
                >
                  <Plus className="h-3.5 w-3.5" /> Agendar aquí
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <AgendaListRow
                    key={`${item.source}:${item.id}`}
                    item={item}
                    colorBySource={colorBySource}
                    onSelect={onSelect}
                    onChanged={onChanged}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
