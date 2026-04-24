"use client";

import { BitacoraEventoItem, type TimelineEvent } from "./BitacoraEvento";

interface Props {
  events: TimelineEvent[];
}

function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

function formatDayHeader(key: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  if (key === today) return "Hoy";
  if (key === yesterday) return "Ayer";
  const d = new Date(key + "T12:00:00");
  return d
    .toLocaleDateString("es-CL", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

export function BitacoraTimeline({ events }: Props) {
  const groups = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = dayKey(ev.timestamp);
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
    a < b ? 1 : -1,
  );

  return (
    <div className="space-y-4">
      {sortedKeys.map((k) => (
        <section key={k}>
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 px-1">
            {formatDayHeader(k)}
          </h3>
          <div className="space-y-1.5">
            {(groups.get(k) ?? []).map((ev) => (
              <BitacoraEventoItem key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
