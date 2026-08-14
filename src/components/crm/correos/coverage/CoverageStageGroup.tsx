"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { CoverageStageGroup as Group } from "./coverage-grouping";

const SWATCH = [
  "bg-tint-teal text-tint-teal-fg",
  "bg-tint-sky text-tint-sky-fg",
  "bg-tint-violet text-tint-violet-fg",
  "bg-tint-amber text-tint-amber-fg",
  "bg-tint-rose text-tint-rose-fg",
  "bg-tint-emerald text-tint-emerald-fg",
] as const;

const DATE =
  "h-10 sm:h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[12px] font-mono [color-scheme:dark]";

export type CoverageStageGroupProps = {
  group: Group;
  colorIndex: number;
  editable: boolean;
  onBulkVigencia: (desde: string | null, hasta: string | null) => void;
  onAddSlot: (kind: "puesto" | "rondin") => void;
  children: React.ReactNode;
};

export function CoverageStageGroup({
  group,
  colorIndex,
  editable,
  onBulkVigencia,
  onAddSlot,
  children,
}: CoverageStageGroupProps) {
  const [open, setOpen] = useState(true);
  const swatch = SWATCH[colorIndex % SWATCH.length];

  return (
    <section className="rounded-xl border border-ds-border-subtle overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 bg-ds-surface-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 min-w-0 flex-1 items-center gap-2 text-left ds-tap sm:h-9"
          aria-expanded={open}
        >
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${swatch}`}
            aria-hidden
          >
            {colorIndex + 1}
          </span>
          <span className="truncate font-display text-[14px] font-semibold text-ds-text-1">
            {group.label}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ds-text-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {editable ? (
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <DatePickerField value={group.vigenciaDesde || null} onChange={(ymd) =>
                onBulkVigencia((ymd ?? "") || null, group.vigenciaHasta)} aria-label={`Vigencia desde ${group.label}`} triggerClassName={DATE} />
            <span className="text-[12px] text-ds-text-4">→</span>
            <DatePickerField value={group.vigenciaHasta || null} onChange={(ymd) =>
                onBulkVigencia(group.vigenciaDesde, (ymd ?? "") || null)} aria-label={`Vigencia hasta ${group.label}`} triggerClassName={DATE} />
          </div>
        ) : (
          (group.vigenciaDesde || group.vigenciaHasta) && (
            <span className="font-mono text-[12px] text-ds-text-3">
              {group.vigenciaDesde ?? "—"} → {group.vigenciaHasta ?? "—"}
            </span>
          )
        )}

        <span className="ml-auto font-mono text-[12px] text-ds-text-3 tabular-nums">
          {group.subtotalHH} HH · {group.subtotalHeadcount} dot
        </span>
      </header>

      {open && (
        <div className="space-y-2 p-3">
          {group.slots.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Sin puestos en esta etapa</p>
          ) : (
            children
          )}
          {editable && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAddSlot("puesto")}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
              >
                <Plus className="h-4 w-4" /> Puesto en esta etapa
              </button>
              <button
                type="button"
                onClick={() => onAddSlot("rondin")}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
              >
                <Plus className="h-4 w-4" /> Rondín
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
