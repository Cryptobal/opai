"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Re-export compatible DateRange type (from is optional for UX convenience)
export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
  presets?: { label: string; range: DateRange }[];
}

const DEFAULT_PRESETS: { label: string; range: DateRange }[] = [
  {
    label: "Este mes",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to: new Date(),
    },
  },
  {
    label: "Mes pasado",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      to: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
    },
  },
  {
    label: "Últimos 3 meses",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1),
      to: new Date(),
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = "Rango de fechas",
  presets = DEFAULT_PRESETS,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const label = value?.from
    ? value.to
      ? `${format(value.from, "dd MMM", { locale: es })} – ${format(value.to, "dd MMM yyyy", { locale: es })}`
      : format(value.from, "dd MMM yyyy", { locale: es })
    : placeholder;

  // Convert our DateRange to DayPicker's DateRange (from is required there)
  const selected: DayPickerDateRange | undefined = value
    ? { from: value.from, to: value.to }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 justify-start text-left text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-1 border-b border-border p-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange(preset.range);
                setOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              {preset.label}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-left text-muted-foreground hover:bg-accent transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range: DayPickerDateRange | undefined) =>
            onChange(range ? { from: range.from, to: range.to } : undefined)
          }
          locale={es}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
