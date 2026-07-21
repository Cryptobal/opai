"use client";

import { todayInChile, utcDateFromYmd, ymdInChile } from "@/lib/dates-cl";
import { VisitChip } from "./VisitChip";
import { LicAllDayChip } from "./LicAllDayChip";
import { GoogleEventChip } from "./GoogleEventChip";
import type { WeekItem } from "./AgendaWeekStrip";

type Props = {
  day: Date;
  items: WeekItem[];
  isToday?: boolean;
  onHeaderClick?: () => void;
  onVisitClick?: (item: WeekItem) => void;
  onLicClick?: (item: WeekItem) => void;
};

/** Columna de un día: header + chips de licitación (all-day) + visitas. */
export function AgendaDayColumn({
  day,
  items,
  isToday,
  onHeaderClick,
  onVisitClick,
  onLicClick,
}: Props) {
  const todayYmd = todayInChile();
  const google = items.filter((i) => i.source === "google");
  const allDay = items.filter((i) => i.allDay && i.source !== "google");
  const timed = items.filter((i) => !i.allDay && i.source !== "google");

  return (
    <div
      className={`min-h-[120px] rounded-xl border p-2 ${
        isToday ? "border-primary bg-primary/5" : "border-ds-border-subtle bg-ds-surface-1"
      }`}
    >
      <button
        type="button"
        onClick={onHeaderClick}
        disabled={!onHeaderClick}
        className={`mb-2 w-full text-left text-[12px] font-medium ds-tap disabled:cursor-default ${
          isToday ? "text-primary" : "text-ds-text-3"
        }`}
      >
        {day.toLocaleDateString("es-CL", {
          weekday: "short",
          day: "numeric",
          timeZone: "America/Santiago",
        })}
      </button>
      <div className="space-y-1.5">
        {allDay.map((i) => {
          const itemYmd = ymdInChile(new Date(i.start));
          const daysLeft = Math.round(
            (utcDateFromYmd(itemYmd).getTime() - utcDateFromYmd(todayYmd).getTime()) / 86_400_000,
          );
          return (
            <LicAllDayChip
              key={`lic-${i.id}`}
              title={i.title}
              daysLeft={daysLeft}
              onClick={() => onLicClick?.(i)}
            />
          );
        })}
        {timed.map((i) => (
          <VisitChip
            key={`${i.source}-${i.id}`}
            type={i.type}
            title={i.title}
            start={i.start}
            syncStatus={i.syncStatus}
            onClick={() => onVisitClick?.(i)}
          />
        ))}
        {google.map((i) => (
          <GoogleEventChip
            key={`google-${i.id}`}
            title={i.title}
            start={i.start}
            allDay={i.allDay}
            htmlLink={i.htmlLink}
            calendarName={i.calendarName}
          />
        ))}
        {allDay.length === 0 && timed.length === 0 && google.length === 0 && (
          <p className="text-[12px] text-ds-text-4">—</p>
        )}
      </div>
    </div>
  );
}
