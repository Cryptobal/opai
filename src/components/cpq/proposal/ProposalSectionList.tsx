"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  FilePenLine,
  FolderInput,
  MoreVertical,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";

const STATUS_LABEL: Record<ProposalSection["status"], string> = {
  ia: "IA",
  editada: "Editada",
  aprobada: "Aprobada",
};

const ORIGIN_LABEL: Record<NonNullable<ProposalSection["origin"]>, string> = {
  fija_empresa: "Fija",
  ia: "IA",
  auto: "Auto",
  bases: "Bases",
  vacia: "Vacía",
};

export function ProposalSectionList({
  sections,
  activeId,
  onSelect,
  readOnly,
  busy,
  onRegenerate,
  onToggleApproval,
  onMove,
  onRemove,
  onMoveExclusiones,
  onSaveAsFixed,
}: {
  sections: ProposalSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  readOnly: boolean;
  busy: boolean;
  onRegenerate: (section: ProposalSection) => void;
  onToggleApproval: (section: ProposalSection) => void;
  onMove: (section: ProposalSection, direction: "up" | "down") => void;
  onRemove: (section: ProposalSection) => void;
  onMoveExclusiones: (section: ProposalSection) => void;
  onSaveAsFixed: (section: ProposalSection) => void;
}) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ordered.map((s, i) => {
          const auto = isAutoSection(s);
          const origin =
            auto || s.origin === "auto"
              ? "auto"
              : !s.content.trim()
                ? "vacia"
                : s.origin ?? "ia";
          const canMoveUp =
            s.invariant !== "identificacion" &&
            i > 0 &&
            ordered[i - 1]?.invariant !== "identificacion";
          const canMoveDown =
            s.invariant !== "identificacion" && i < ordered.length - 1;
          const removable = !s.invariant && !auto;
          return (
            <div
              key={s.id}
              className={cn(
                "flex min-h-11 min-w-[14rem] shrink-0 items-center gap-1 rounded-2xl border p-1 text-left lg:w-full lg:min-w-0",
                s.id === activeId
                  ? "border-primary bg-primary/10"
                  : "border-ds-border-subtle bg-ds-surface-2",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
                  {i + 1}. {s.title}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Tag variant={origin === "vacia" ? "neutral" : "info"} size="sm">
                    {ORIGIN_LABEL[origin]}
                  </Tag>
                  {!auto && s.status !== "ia" ? (
                    <Tag
                      variant={
                        s.status === "aprobada"
                          ? "ok"
                          : s.status === "editada"
                            ? "warn"
                            : "neutral"
                      }
                      size="sm"
                    >
                      {STATUS_LABEL[s.status]}
                    </Tag>
                  ) : null}
                </span>
              </button>
              {!readOnly ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 sm:h-9 sm:w-9"
                      disabled={busy}
                      aria-label={`Acciones de ${s.title}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem onSelect={() => onSelect(s.id)}>
                      <FilePenLine className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    {!auto ? (
                      <DropdownMenuItem onSelect={() => onRegenerate(s)}>
                        <RefreshCw className="h-4 w-4" />
                        Regenerar con instrucción
                      </DropdownMenuItem>
                    ) : null}
                    {!auto ? (
                      <DropdownMenuItem onSelect={() => onToggleApproval(s)}>
                        {s.status === "aprobada" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {s.status === "aprobada" ? "Desaprobar" : "Aprobar"}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(s, "up")}>
                      <ArrowUp className="h-4 w-4" />
                      Mover arriba
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(s, "down")}>
                      <ArrowDown className="h-4 w-4" />
                      Mover abajo
                    </DropdownMenuItem>
                    {removable ? (
                      <DropdownMenuItem onSelect={() => onMoveExclusiones(s)}>
                        <FolderInput className="h-4 w-4" />
                        Mover a Exclusiones
                      </DropdownMenuItem>
                    ) : null}
                    {!auto ? (
                      <DropdownMenuItem onSelect={() => onSaveAsFixed(s)}>
                        <Save className="h-4 w-4" />
                        Guardar como fija de empresa
                      </DropdownMenuItem>
                    ) : null}
                    {removable ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-status-danger-fg focus:text-status-danger-fg"
                          onSelect={() => onRemove(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
