"use client";

import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { sectionOriginPill } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";

const STATUS_LABEL: Record<ProposalSection["status"], string> = {
  ia: "IA",
  editada: "Editada",
  aprobada: "Aprobada",
};

const ORIGIN_VARIANT: Record<ReturnType<typeof sectionOriginPill>, "neutral" | "info" | "ok" | "warn" | "brand"> = {
  Fija: "brand",
  IA: "neutral",
  Auto: "info",
  Bases: "ok",
  Vacía: "warn",
};

export function ProposalSectionList({
  sections,
  activeId,
  onSelect,
  generating,
}: {
  sections: ProposalSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  generating?: boolean;
}) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2">
      <div className="hidden flex-wrap gap-1.5 lg:flex">
        <span className="text-[12px] text-ds-text-3">Origen:</span>
        <Tag variant="brand" size="sm">Fija</Tag>
        <Tag variant="neutral" size="sm">IA</Tag>
        <Tag variant="info" size="sm">Auto</Tag>
        <Tag variant="ok" size="sm">Bases</Tag>
        <Tag variant="warn" size="sm">Vacía</Tag>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ordered.map((s, i) => {
          const auto = isAutoSection(s);
          const origin = sectionOriginPill(s);
          const empty = !s.content.trim() && !auto;
          const isGenerating = Boolean(generating && empty && s.origin !== "fija_empresa");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex min-h-11 min-w-[9.5rem] shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-2 text-left lg:min-w-0 lg:w-full lg:rounded-xl",
                s.id === activeId
                  ? "border-primary bg-primary/10"
                  : "border-ds-border-subtle bg-ds-surface-2",
              )}
            >
              <span className="truncate text-[13px] font-medium text-ds-text-1">
                {i + 1}. {s.title}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {isGenerating ? (
                  <Tag variant="warn" size="sm">Generando…</Tag>
                ) : (
                  <Tag variant={ORIGIN_VARIANT[origin]} size="sm">
                    {origin}
                  </Tag>
                )}
                {!auto && s.status === "aprobada" ? (
                  <Tag variant="ok" size="sm">{STATUS_LABEL.aprobada}</Tag>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
