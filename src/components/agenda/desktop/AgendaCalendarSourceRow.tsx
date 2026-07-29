"use client";

import { Check, MoreHorizontal, Target } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "@/components/opai-ds";
import { paletteFgBg } from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";
import { CalendarColorPopover } from "../CalendarColorPopover";
import type { CalendarSource } from "./AgendaCalendarList";

type Props = {
  source: CalendarSource;
  count: number;
  onToggle: (sourceKey: string) => void;
  onColorChange: (sourceKey: string, color: string) => void;
  onSetCreateTarget?: (sourceKey: string) => void;
};

export function AgendaCalendarSourceRow({
  source,
  count,
  onToggle,
  onColorChange,
  onSetCreateTarget,
}: Props) {
  const active = !source.hidden;
  const swatch = paletteFgBg(source.color);

  return (
    <div className="group flex h-8 w-full items-center gap-1.5 rounded-lg px-1.5 hover:bg-ds-surface-2">
      <button
        type="button"
        onClick={() => onToggle(source.sourceKey)}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2 text-left ds-tap"
      >
        <span
          className={cn(
            "inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded",
            active ? swatch : "border border-ds-border-default",
          )}
        >
          {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            active ? "text-ds-text-2" : "text-ds-text-4 line-through decoration-ds-text-4/40",
          )}
        >
          {source.name}
        </span>
        {source.isCreateTarget && (
          <Tag size="sm" variant="info" className="shrink-0 text-[12px]">
            crea aquí
          </Tag>
        )}
        {count > 0 && (
          <span className="shrink-0 font-mono text-[12px] text-ds-text-4">{count}</span>
        )}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Opciones de ${source.name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ds-text-4 opacity-0 transition-opacity hover:bg-ds-surface-3 group-hover:opacity-100 ds-tap"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 space-y-2 border-ds-border-default bg-ds-surface-1 p-2">
          <CalendarColorPopover color={source.color} onChange={(key) => onColorChange(source.sourceKey, key)}>
            <button type="button" className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-ds-surface-2 ds-tap">
              <span className={cn("h-5 w-5 rounded-md", swatch)} />
              Cambiar color
            </button>
          </CalendarColorPopover>
          {source.kind === "google" && onSetCreateTarget && !source.isCreateTarget && (
            <button
              type="button"
              onClick={() => onSetCreateTarget(source.sourceKey)}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-ds-surface-2 ds-tap"
            >
              <Target className="h-4 w-4 shrink-0 text-ds-text-3" />
              Marcar como destino
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
