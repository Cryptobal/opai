"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import type { DayPickerProps, DropdownProps } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";

export type CalendarProps = DayPickerProps;

/** Rango por defecto: 100 años atrás → 30 años adelante (cumpleaños + contratos). */
const DEFAULT_START_MONTH = (() => {
  const y = new Date().getFullYear();
  return new Date(y - 100, 0, 1);
})();

const DEFAULT_END_MONTH = (() => {
  const y = new Date().getFullYear();
  return new Date(y + 30, 11, 31);
})();

function defaultStartMonth(): Date {
  return DEFAULT_START_MONTH;
}

function defaultEndMonth(): Date {
  return DEFAULT_END_MONTH;
}

/**
 * Select de mes/año con Radix (portal) — evita el select nativo opacity-0
 * que en Chrome se renderiza mal con ~130 opciones de año.
 */
function CalendarDropdown({ value, onChange, options, "aria-label": ariaLabel, disabled }: DropdownProps) {
  const selected = options?.find((o) => o.value === Number(value));

  return (
    <SelectPrimitive.Root
      value={value !== undefined ? String(value) : undefined}
      disabled={disabled}
      onValueChange={(next) => {
        onChange?.({
          target: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-auto min-w-0 items-center justify-between gap-1 rounded-md",
          "border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] font-medium text-foreground",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <SelectPrimitive.Value placeholder={selected?.label}>
          {selected?.label}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-[200] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md",
            "border border-ds-border-default bg-popover text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <SelectPrimitive.Viewport className="max-h-72 overflow-y-auto p-1">
            {options?.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={String(option.value)}
                disabled={option.disabled}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2",
                  "text-[13px] outline-none focus:bg-accent focus:text-accent-foreground",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = es,
  weekStartsOn = 1,
  captionLayout = "dropdown",
  startMonth = DEFAULT_START_MONTH,
  endMonth = DEFAULT_END_MONTH,
  navLayout = "around",
  components,
  ...props
}: CalendarProps) {
  const isDropdown =
    captionLayout === "dropdown" ||
    captionLayout === "dropdown-months" ||
    captionLayout === "dropdown-years";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      weekStartsOn={weekStartsOn}
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      navLayout={navLayout}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "relative flex flex-col gap-4",
        month_caption: cn(
          "relative flex items-center justify-center",
          isDropdown ? "h-9 w-full px-9" : "pt-1",
        ),
        caption_label: "text-sm font-medium text-foreground",
        dropdowns: "flex h-9 w-full items-center justify-center gap-1.5",
        dropdown_root: "relative",
        dropdown: "absolute inset-0 opacity-0",
        nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between",
        button_previous: cn(
          "absolute left-1 top-1 z-10 h-7 w-7 bg-transparent p-0 opacity-50",
          "hover:opacity-100 hover:bg-accent hover:text-accent-foreground",
          "inline-flex items-center justify-center rounded-md text-sm",
          "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        ),
        button_next: cn(
          "absolute right-1 top-1 z-10 h-7 w-7 bg-transparent p-0 opacity-50",
          "hover:opacity-100 hover:bg-accent hover:text-accent-foreground",
          "inline-flex items-center justify-center rounded-md text-sm",
          "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "[&:has([aria-selected].day-range-start)]:rounded-l-md",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(
          "h-9 w-9 p-0 font-normal text-foreground",
          "inline-flex items-center justify-center rounded-md text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "aria-selected:opacity-100",
        ),
        range_start: "day-range-start",
        range_end: "day-range-end",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
        today: "bg-accent text-accent-foreground rounded-md",
        outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...rest }) => {
          const iconClass = cn("h-4 w-4", chevronClassName);
          if (orientation === "left") {
            return <ChevronLeft className={iconClass} {...rest} />;
          }
          if (orientation === "down") {
            return <ChevronDown className={iconClass} {...rest} />;
          }
          return <ChevronRight className={iconClass} {...rest} />;
        },
        Dropdown: CalendarDropdown,
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar, defaultStartMonth, defaultEndMonth };
