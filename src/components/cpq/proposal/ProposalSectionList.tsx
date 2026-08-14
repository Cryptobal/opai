"use client";

import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";

const STATUS_LABEL: Record<ProposalSection["status"], string> = {
  ia: "IA",
  editada: "Editada",
  aprobada: "Aprobada",
};

export function ProposalSectionList({
  sections,
  activeId,
  onSelect,
}: {
  sections: ProposalSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2">
      <div className="hidden flex-wrap gap-1.5 lg:flex">
        <span className="text-[12px] text-ds-text-3">Leyenda:</span>
        <Tag variant="neutral" size="sm">IA</Tag>
        <Tag variant="warn" size="sm">Editada</Tag>
        <Tag variant="ok" size="sm">Aprobada</Tag>
        <Tag variant="info" size="sm">Auto</Tag>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ordered.map((s, i) => {
          const auto = isAutoSection(s);
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
              <Tag
                variant={
                  auto
                    ? "info"
                    : s.status === "aprobada"
                      ? "ok"
                      : s.status === "editada"
                        ? "warn"
                        : "neutral"
                }
                size="sm"
              >
                {auto ? "Auto" : STATUS_LABEL[s.status]}
              </Tag>
            </button>
          );
        })}
      </div>
    </div>
  );
}
