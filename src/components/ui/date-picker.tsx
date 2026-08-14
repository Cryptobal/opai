"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { todayInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Convierte YYYY-MM-DD a Date local (sin shift UTC). */
export function ymdToLocalDate(ymd: string): Date | undefined {
  if (!YMD_RE.test(ymd)) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → YYYY-MM-DD plano. */
export function localDateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(ymd: string): string {
  const d = ymdToLocalDate(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type DatePickerFieldProps = {
  value: string | null;
  onChange: (ymd: string | null) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  triggerClassName?: string;
  /** Envuelve un trigger custom (KPI, chips). */
  asChild?: boolean;
  children?: React.ReactNode;
  /** Si hay `name`, se sincroniza un input hidden para forms nativos. */
  name?: string;
  id?: string;
  required?: boolean;
  className?: string;
};

export function DatePickerField({
  value,
  onChange,
  min,
  max,
  disabled = false,
  clearable = false,
  placeholder = "Elegir fecha",
  "aria-label": ariaLabel,
  triggerClassName,
  asChild = false,
  children,
  name,
  id,
  required,
  className,
}: DatePickerFieldProps) {
  const [open, setOpen] = React.useState(false);
  const ymd = value && YMD_RE.test(value.slice(0, 10)) ? value.slice(0, 10) : null;
  const selected = ymd ? ymdToLocalDate(ymd) : undefined;
  const minDate = min ? ymdToLocalDate(min.slice(0, 10)) : undefined;
  const maxDate = max ? ymdToLocalDate(max.slice(0, 10)) : undefined;

  const disabledMatchers: Array<{ before: Date } | { after: Date }> = [];
  if (minDate) disabledMatchers.push({ before: minDate });
  if (maxDate) disabledMatchers.push({ after: maxDate });

  function pick(d: Date | undefined) {
    if (!d) return;
    onChange(localDateToYmd(d));
    setOpen(false);
  }

  const defaultTrigger = (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-label={ariaLabel ?? placeholder}
      className={cn(
        "inline-flex h-10 min-h-10 w-full items-center gap-2 rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-left text-[13px] text-ds-text-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "sm:h-9 sm:min-h-9",
        !ymd && "text-ds-text-3",
        triggerClassName,
      )}
    >
      <CalendarIcon className="h-4 w-4 shrink-0 text-ds-text-3" />
      <span className="min-w-0 flex-1 truncate">{ymd ? formatDisplay(ymd) : placeholder}</span>
    </button>
  );

  const trigger = asChild && children ? children : defaultTrigger;

  return (
    <div className={cn("inline-flex w-full min-w-0", asChild && "w-auto", className)}>
      {name ? (
        <input type="hidden" name={name} value={ymd ?? ""} required={required} />
      ) : null}
      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <PopoverTrigger asChild disabled={disabled}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0 motion-reduce:animate-none"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={pick}
            defaultMonth={selected}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
          />
          <div className="flex items-center justify-between gap-2 border-t border-ds-border-subtle p-2">
            {clearable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 sm:h-8"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Limpiar
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => {
                const today = ymdToLocalDate(todayInChile());
                if (today) pick(today);
              }}
            >
              Hoy
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
