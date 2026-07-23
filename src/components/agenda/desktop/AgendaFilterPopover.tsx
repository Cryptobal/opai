"use client";

import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FilterGroup } from "../FilterGroup";
import type { AgendaContentFilter, AgendaTypeFilter } from "../agenda-calendar.types";

export const CONTENT_OPTIONS: Array<{ id: AgendaContentFilter; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "reuniones", label: "Reuniones y visitas" },
  { id: "tareas", label: "Tareas" },
];

export const TYPE_OPTIONS: Array<{ id: AgendaTypeFilter; label: string }> = [
  { id: "todos", label: "Todos los tipos" },
  { id: "cliente", label: "Cliente" },
  { id: "tecnica", label: "Técnica" },
  { id: "supervision", label: "Supervisión" },
  { id: "otra", label: "Otra" },
  { id: "licitacion", label: "Licitación" },
];

type Props = {
  contentFilter: AgendaContentFilter;
  typeFilter: AgendaTypeFilter;
  onContentFilterChange: (filter: AgendaContentFilter) => void;
  onTypeFilterChange: (filter: AgendaTypeFilter) => void;
  buttonClass: string;
};

/** Filtros de contenido/tipo en Popover con portal (fix: salía detrás del grid). */
export function AgendaFilterPopover({
  contentFilter,
  typeFilter,
  onContentFilterChange,
  onTypeFilterChange,
  buttonClass,
}: Props) {
  const activeCount = Number(contentFilter !== "todo") + Number(typeFilter !== "todos");

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Filtros"
        className={cn(
          buttonClass,
          "relative w-9 px-0",
          activeCount > 0 && "border-primary/40 text-primary",
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[12px] font-semibold leading-none text-primary-foreground">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 min-w-0 max-w-none space-y-3 rounded-xl border-ds-border-default bg-ds-surface-1 p-2 shadow-ds-lg"
      >
        <FilterGroup
          label="Contenido"
          options={CONTENT_OPTIONS}
          value={contentFilter}
          onChange={(value) => onContentFilterChange(value as AgendaContentFilter)}
        />
        <div className="border-t border-ds-border-subtle" />
        <FilterGroup
          label="Tipo"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(value) => onTypeFilterChange(value as AgendaTypeFilter)}
        />
      </PopoverContent>
    </Popover>
  );
}
