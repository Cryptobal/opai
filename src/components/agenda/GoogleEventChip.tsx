"use client";

import { Clock, ExternalLink } from "lucide-react";
import {
  paletteBorder,
  paletteFgText,
  paletteSoftBg,
} from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  start: string;
  allDay?: boolean;
  htmlLink?: string | null;
  /** Nombre del calendario secundario (null/undefined = primary). */
  calendarName?: string | null;
  eventColor?: string;
};

/**
 * Chip para eventos de Google Calendar. Click → abre el evento en Google Calendar.
 */
export function GoogleEventChip({
  title,
  start,
  allDay,
  htmlLink,
  calendarName,
  eventColor = "teal",
}: Props) {
  const time = allDay
    ? "Todo el día"
    : new Date(start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const subtitle = calendarName ? calendarName : "Google Calendar";
  const tip = calendarName ? `${title} · ${calendarName}` : title;

  return (
    <a
      href={htmlLink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={tip}
      className={cn(
        "block w-full rounded-xl border border-l-2 px-2 py-1.5 text-left text-[12px] ds-tap",
        paletteSoftBg(eventColor),
        paletteFgText(eventColor),
        paletteBorder(eventColor),
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 font-medium">
          <Clock className="h-3 w-3 shrink-0 opacity-70" />
          {time}
        </span>
        {htmlLink && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
      </div>
      <p className="truncate">{title}</p>
      <span className="mt-1 inline-block truncate text-[12px] font-mono uppercase tracking-[0.08em] opacity-70">
        {subtitle}
      </span>
    </a>
  );
}
