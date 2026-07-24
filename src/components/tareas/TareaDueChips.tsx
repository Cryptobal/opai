"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAgendaTime } from "@/components/agenda/agenda-calendar-utils";
import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { TareaDatePopover, dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";

export type { DueValue };

/** Clase base de un chip de vencimiento (glass soft, sin blur). */
function chipClass(active: boolean): string {
  return cn(
    "opai-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl px-3 text-[13px] transition-colors disabled:opacity-50",
    active ? "border-primary/50 bg-primary/15 text-primary" : "text-ds-text-2 hover:text-ds-text-1",
  );
}

/**
 * Chips de vencimiento sin componentes nativos del SO: Hoy · Mañana ·
 * Próx. semana · Fecha y hora · Sin fecha. "Fecha y hora" abre un popover glass
 * (Calendar del DS + TaskTimePicker). Conversiones vía dateAtChileSlot
 * (America/Santiago); sin hora → allDay.
 */
export function TareaDueChips({
  value,
  onChange,
  disabled,
}: {
  value: DueValue;
  onChange: (next: DueValue) => void;
  disabled?: boolean;
}) {
  const { todayYmd, tomorrowYmd, weekYmd } = useMemo(() => {
    const now = new Date();
    return {
      todayYmd: todayInChile(now),
      tomorrowYmd: ymdInChile(addDaysChile(now, 1)),
      weekYmd: ymdInChile(addDaysChile(now, 7)),
    };
  }, []);

  const dueYmd = value.dueAt ? ymdInChile(new Date(value.dueAt)) : null;
  const active = !value.dueAt
    ? "sinfecha"
    : dueYmd === todayYmd
      ? "hoy"
      : dueYmd === tomorrowYmd
        ? "manana"
        : "custom";

  const quick: Array<{ key: string; label: string; ymd: string; on: boolean }> = [
    { key: "hoy", label: "Hoy", ymd: todayYmd, on: active === "hoy" },
    { key: "manana", label: "Mañana", ymd: tomorrowYmd, on: active === "manana" },
    { key: "semana", label: "Próx. semana", ymd: weekYmd, on: false },
  ];

  const customLabel = (() => {
    if (!value.dueAt) return "Fecha y hora";
    const d = new Date(value.dueAt);
    const day = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "America/Santiago" });
    return value.allDay ? day : `${day} · ${formatAgendaTime(d)}`;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quick.map((q) => (
        <button
          key={q.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(dueFromYmd(q.ymd, DEFAULT_MINUTE, true))}
          className={chipClass(q.on)}
        >
          {q.label}
        </button>
      ))}

      <TareaDatePopover
        value={value}
        onChange={onChange}
        disabled={disabled}
        triggerClassName={chipClass(active === "custom")}
      >
        <CalendarClock className="h-4 w-4" />
        {customLabel}
      </TareaDatePopover>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ dueAt: null, allDay: true })}
        className={chipClass(active === "sinfecha")}
      >
        Sin fecha
      </button>
    </div>
  );
}
