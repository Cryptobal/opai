"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import type { DayPickerProps } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        month_caption: cn(
          "flex justify-center pt-1 relative items-center",
          isDropdown && "h-9 w-full px-9",
        ),
        caption_label: cn(
          "text-sm font-medium text-foreground",
          isDropdown &&
            "flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-[13px] [&>svg]:size-3.5 [&>svg]:text-ds-text-3",
        ),
        dropdowns: "flex h-9 w-full items-center justify-center gap-1.5",
        dropdown_root:
          "relative rounded-md border border-ds-border-default bg-ds-surface-1 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
        dropdown:
          "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 appearance-none",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50",
          "hover:opacity-100 hover:bg-accent hover:text-accent-foreground",
          "inline-flex items-center justify-center rounded-md text-sm",
          "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        ),
        button_next: cn(
          "absolute right-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50",
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
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar, defaultStartMonth, defaultEndMonth };
