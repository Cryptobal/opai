"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CALENDAR_PALETTE_ORDER,
  PALETTE_SOFT,
  type CalendarPaletteKey,
} from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";

type Props = {
  color: string;
  onChange: (key: string) => void;
  children: React.ReactNode;
};

/** Selector de color de calendario (12 swatches DS). */
export function CalendarColorPopover({ color, onChange, children }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        className="w-auto border-ds-border-default bg-ds-surface-1 p-2"
      >
        <div
          role="radiogroup"
          aria-label="Color del calendario"
          className="grid grid-cols-4 gap-1.5"
        >
          {CALENDAR_PALETTE_ORDER.map((key: CalendarPaletteKey) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={key}
              onClick={() => onChange(key)}
              className={cn(
                "h-8 w-8 rounded-lg ds-tap",
                PALETTE_SOFT[key],
                color === key &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-ds-surface-1",
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
