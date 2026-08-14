"use client";

import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";

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
    <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {ordered.map((s, i) => (
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
            variant={s.status === "aprobada" ? "ok" : s.status === "editada" ? "warn" : "neutral"}
            size="sm"
          >
            {STATUS_LABEL[s.status]}
          </Tag>
        </button>
      ))}
    </div>
  );
}
