"use client";

import { DURATIONS } from "./types";

const INPUT =
  "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body sm:h-9";

export function ScheduleFields({
  date,
  time,
  durationMin,
  onDate,
  onTime,
  onDuration,
}: {
  date: string;
  time: string;
  durationMin: number;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onDuration: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="space-y-1">
        <label className="text-[12px] text-ds-text-3">Fecha</label>
        <input type="date" className={INPUT} value={date} onChange={(e) => onDate(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-[12px] text-ds-text-3">Hora inicio</label>
        <input type="time" className={INPUT} value={time} onChange={(e) => onTime(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-[12px] text-ds-text-3">Duración</label>
        <select
          className={INPUT}
          value={durationMin}
          onChange={(e) => onDuration(Number(e.target.value))}
        >
          {DURATIONS.map((d) => (
            <option key={d.min} value={d.min}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
