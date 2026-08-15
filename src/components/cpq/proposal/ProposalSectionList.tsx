"use client";

import { ChevronDown, Pencil } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { EconomicOpeningTable } from "./EconomicOpeningTable";

const ORIGIN_LABEL: Record<NonNullable<ProposalSection["origin"]>, string> = {
  fija_empresa: "Fija",
  ia: "IA",
  auto: "Auto",
  bases: "Bases",
  vacia: "Vacía",
};

function previewText(content: string, max = 140): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "Sin contenido aún.";
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

export function ProposalSectionList({
  sections,
  expandedId,
  onToggleExpand,
  onEdit,
  readOnly,
  mode,
  opening,
  failedIds,
  onRetry,
}: {
  sections: ProposalSection[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (section: ProposalSection) => void;
  readOnly: boolean;
  mode: "comercial" | "licitacion";
  opening?: EconomicOpening | null;
  failedIds?: ReadonlySet<string>;
  onRetry?: (section: ProposalSection) => void;
}) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <ul className="ds-list-cascade space-y-2">
      {ordered.map((section, index) => {
        const auto = isAutoSection(section);
        const origin =
          auto || section.origin === "auto"
            ? "auto"
            : !section.content.trim()
              ? "vacia"
              : section.origin ?? "ia";
        const expanded = expandedId === section.id;
        const failed = failedIds?.has(section.id);
        const empty = !section.content.trim() && !auto;

        return (
          <li key={section.id}>
            <div
              className={cn(
                "rounded-2xl border border-ds-border-subtle bg-ds-surface-2 transition-colors",
                expanded && "border-ds-border-default bg-ds-surface-1",
                failed && "border-status-warn-border",
              )}
            >
              <div className="flex items-start gap-1 p-1">
                <button
                  type="button"
                  onClick={() => onToggleExpand(section.id)}
                  className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-2 text-left"
                  aria-expanded={expanded}
                >
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-ds-text-3 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ds-text-1">
                        {index + 1}. {section.title}
                      </span>
                      <Tag variant={origin === "vacia" || failed ? "neutral" : "info"} size="sm">
                        {failed ? "Reintentar" : ORIGIN_LABEL[origin]}
                      </Tag>
                      {mode === "licitacion" && !auto && section.status === "aprobada" ? (
                        <Tag variant="ok" size="sm">
                          Aprobada
                        </Tag>
                      ) : null}
                    </span>
                    {!expanded ? (
                      <span className="block text-[12px] leading-snug text-ds-text-3">
                        {auto
                          ? "Tabla automática desde el costeo vigente."
                          : previewText(section.content)}
                      </span>
                    ) : null}
                  </span>
                </button>
                {!readOnly && !auto ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-10 w-10 shrink-0 sm:h-9 sm:w-9"
                    aria-label={`Editar ${section.title}`}
                    onClick={() => onEdit(section)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {expanded ? (
                <div className="space-y-3 border-t border-ds-border-subtle px-3 py-3">
                  {auto ? (
                    opening ? (
                      <EconomicOpeningTable opening={opening} />
                    ) : (
                      <p className="text-[13px] text-ds-text-3">
                        Sin costeo aún. La tabla se llena al calcular la cotización.
                      </p>
                    )
                  ) : empty ? (
                    <p className="text-[13px] text-ds-text-3">
                      {failed
                        ? "No se pudo generar esta sección."
                        : "Sección vacía."}
                    </p>
                  ) : (
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ds-text-2">
                      {section.content}
                    </div>
                  )}
                  {failed && onRetry && !readOnly ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 sm:h-9"
                      onClick={() => onRetry(section)}
                    >
                      Reintentar
                    </Button>
                  ) : null}
                  {!readOnly && !auto ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 w-full sm:h-9 sm:w-auto"
                      onClick={() => onEdit(section)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar sección
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
