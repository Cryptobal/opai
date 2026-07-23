"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/**
 * Selector horario en pasos de 15 minutos, con botón "Sin hora" explícito.
 *
 * `value` = "HH:MM" (cadena vacía = sin hora / todo el día). Elegir una hora
 * llama `onChange("HH:MM")`; "Sin hora" llama `onChange("")`. Tokens DS v3,
 * cierre por click-outside y Escape.
 */
export function TaskTimePicker({
  value,
  onChange,
  className,
  ariaLabel = "Hora (pasos de 15 min)",
}: {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedHour(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSelectedHour(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pickMinute = (minute: string) => {
    if (!selectedHour) return;
    onChange(`${selectedHour}:${minute}`);
    setOpen(false);
    setSelectedHour(null);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex h-9 min-h-[44px] items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:min-h-0"
      >
        <Clock3 className="h-4 w-4 text-ds-text-4" />
        <span className={cn(!value && "text-ds-text-4")}>{value || "Sin hora"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-ds-border-default bg-ds-surface-1 p-2 shadow-ds-lg">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              setSelectedHour(null);
            }}
            className={cn(
              "mb-2 w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ds-surface-2",
              !value ? "bg-primary/10 font-medium text-primary" : "text-ds-text-1",
            )}
          >
            Sin hora (todo el día)
          </button>

          {!selectedHour ? (
            <div>
              <div className="mb-1 px-1 text-[12px] font-medium text-ds-text-4">Hora</div>
              <div className="grid grid-cols-6 gap-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setSelectedHour(h)}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg text-[13px] hover:bg-ds-surface-2",
                      value.startsWith(`${h}:`) ? "bg-primary/10 font-medium text-primary" : "text-ds-text-1",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setSelectedHour(null)}
                className="mb-1 flex items-center gap-1 px-1 text-[12px] font-medium text-ds-text-4 hover:text-ds-text-1"
              >
                <ChevronLeft className="h-3 w-3" /> {selectedHour}:__
              </button>
              <div className="grid grid-cols-4 gap-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickMinute(m)}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-lg text-[13px] hover:bg-ds-surface-2",
                      value === `${selectedHour}:${m}` ? "bg-primary text-primary-foreground" : "text-ds-text-1",
                    )}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
