"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/**
 * Selector horario en pasos de 15' renderizado **en flujo** (sin portal), para
 * poder anidarlo dentro del popover de fecha y del diálogo de detalle sin los
 * problemas de z-index / click-outside que tiene un menú portaleado a <body>.
 * `value` = "HH:MM" ("" = sin hora / todo el día).
 */
export function TareaTimeGrid({
  value,
  onPick,
  onClear,
}: {
  value: string;
  onPick: (hhmm: string) => void;
  onClear: () => void;
}) {
  const [hour, setHour] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[12px] font-medium text-ds-text-4">Hora</span>
        <button
          type="button"
          onClick={() => { setHour(null); onClear(); }}
          className={cn(
            "rounded-lg px-2 py-1 text-[12px]",
            value ? "text-ds-text-4 hover:text-ds-text-1" : "bg-primary/10 font-medium text-primary",
          )}
        >
          Sin hora
        </button>
      </div>

      {!hour ? (
        <div className="grid grid-cols-6 gap-1">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHour(h)}
              className={cn(
                "flex h-9 min-h-[40px] items-center justify-center rounded-lg text-ds-body hover:bg-ds-surface-2",
                value.startsWith(`${h}:`) ? "bg-primary/10 font-medium text-primary" : "text-ds-text-1",
              )}
            >
              {h}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setHour(null)}
            className="mb-1 flex items-center gap-1 px-1 text-[12px] font-medium text-ds-text-4 hover:text-ds-text-1"
          >
            <ChevronLeft className="h-3 w-3" /> {hour}:__
          </button>
          <div className="grid grid-cols-4 gap-1">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onPick(`${hour}:${m}`); setHour(null); }}
                className={cn(
                  "flex h-10 min-h-[40px] items-center justify-center rounded-lg text-ds-body hover:bg-ds-surface-2",
                  value === `${hour}:${m}` ? "bg-primary text-primary-foreground" : "text-ds-text-1",
                )}
              >
                :{m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
