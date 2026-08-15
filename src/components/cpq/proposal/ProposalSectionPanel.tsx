"use client";

import { useEffect, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Check,
  Trash2,
  BookmarkPlus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner, Tag } from "@/components/opai-ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { sectionOriginPill } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { EconomicOpeningTable } from "./EconomicOpeningTable";

export function ProposalSectionPanel({
  section,
  readOnly,
  busy,
  opening,
  openingLoading,
  canMoveUp,
  canMoveDown,
  onSave,
  onApprove,
  onUnapprove,
  onRegenerate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSaveAsFixed,
}: {
  section: ProposalSection;
  readOnly: boolean;
  busy: boolean;
  opening?: EconomicOpening | null;
  openingLoading?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onSave: (content: string, title: string) => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onRegenerate: (instruction: string) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSaveAsFixed?: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const auto = isAutoSection(section);
  const origin = sectionOriginPill(section);
  const canDelete = !section.invariant && !auto;

  useEffect(() => {
    setTitle(section.title);
    setContent(section.content);
    setEditing(false);
    setInstruction("");
  }, [section.id, section.title, section.content]);

  if (auto) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ds-text-1">{section.title}</h3>
          <Tag variant="info" size="sm">Auto · siempre al día</Tag>
        </div>
        <p className="text-[13px] text-ds-text-3">
          Se resuelve en cada preview y PDF desde el costeo vigente. No se edita ni se aprueba a mano.
        </p>
        {openingLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
            <Spinner size="sm" /> Cargando apertura…
          </div>
        ) : opening ? (
          <EconomicOpeningTable opening={opening} />
        ) : (
          <p className="text-[13px] text-ds-text-3">Sin costeo aún. La tabla se llena al calcular la cotización.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {editing ? (
            <Input
              value={title}
              disabled={readOnly || Boolean(section.invariant) || busy}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 sm:h-9 font-display text-[15px]"
            />
          ) : (
            <h3 className="font-display text-[15px] font-semibold text-ds-text-1">{section.title}</h3>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Tag variant="neutral" size="sm">{origin}</Tag>
            {section.status === "aprobada" ? <Tag variant="ok" size="sm">Aprobada</Tag> : null}
            {section.ref ? (
              <span className="text-[12px] text-status-info-fg">Ref. {section.ref}</span>
            ) : null}
          </div>
        </div>
        {!readOnly ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
                disabled={busy}
                aria-label="Acciones de sección"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const instr = instruction.trim() || window.prompt("Instrucción para regenerar (opcional):") || "";
                  onRegenerate(instr);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Regenerar con instrucción
              </DropdownMenuItem>
              {section.status === "aprobada" ? (
                <DropdownMenuItem onClick={onUnapprove}>
                  Quitar aprobación
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onApprove}>
                  <Check className="h-4 w-4" />
                  Aprobar
                </DropdownMenuItem>
              )}
              {onMoveUp ? (
                <DropdownMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
                  <ArrowUp className="h-4 w-4" />
                  Mover arriba
                </DropdownMenuItem>
              ) : null}
              {onMoveDown ? (
                <DropdownMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
                  <ArrowDown className="h-4 w-4" />
                  Mover abajo
                </DropdownMenuItem>
              ) : null}
              {onSaveAsFixed ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSaveAsFixed}>
                    <BookmarkPlus className="h-4 w-4" />
                    Guardar como fija de empresa
                  </DropdownMenuItem>
                </>
              ) : null}
              {canDelete && onRemove ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-status-danger-fg"
                    onClick={onRemove}
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

      {editing ? (
        <Textarea
          value={content}
          disabled={readOnly || busy}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="min-h-[200px] text-[13px]"
        />
      ) : (
        <div className="min-h-[120px] whitespace-pre-wrap rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-3 text-[13px] text-ds-text-1">
          {content.trim() || (
            <span className="text-ds-text-3">Sin contenido aún. Usa Regenerar o Generar propuesta.</span>
          )}
        </div>
      )}

      {!readOnly && editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={() => {
              onSave(content, title);
              setEditing(false);
            }}
          >
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={() => {
              setTitle(section.title);
              setContent(section.content);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={instruction}
            disabled={busy}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Instrucción para regenerar (opcional)"
            className="h-10 sm:h-9"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={() => onRegenerate(instruction)}
          >
            Regenerar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
