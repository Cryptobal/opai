"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  MoreVertical,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Spinner, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { EconomicOpeningTable } from "./EconomicOpeningTable";
import { confirmDialog } from "@/components/ui/confirm-service";

export function ProposalSectionSheet({
  open,
  onOpenChange,
  section,
  readOnly,
  busy,
  mode,
  opening,
  canMoveUp,
  canMoveDown,
  onSave,
  onApprove,
  onUnapprove,
  onRegenerate,
  onSaveAsFixed,
  onDelete,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: ProposalSection | null;
  readOnly: boolean;
  busy: boolean;
  mode: "comercial" | "licitacion";
  opening?: EconomicOpening | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSave: (content: string, title: string) => void | Promise<void>;
  onApprove: () => void;
  onUnapprove: () => void;
  onRegenerate: (instruction: string) => void | Promise<void>;
  onSaveAsFixed: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [content, setContent] = useState(section?.content ?? "");
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (!section) return;
    setTitle(section.title);
    setContent(section.content);
    setInstruction("");
  }, [section]);

  if (!section) return null;

  const auto = isAutoSection(section);
  const dirty =
    title.trim() !== section.title.trim() || content !== section.content;
  const wasEdited = section.status === "editada" || Boolean(section.content.trim());

  async function handleClose(nextOpen: boolean) {
    if (!nextOpen && dirty && !readOnly && !auto) {
      await onSave(content, title);
    }
    onOpenChange(nextOpen);
  }

  async function handleRegenerate() {
    if (wasEdited) {
      const ok = await confirmDialog({
        title: "¿Regenerar sección editada?",
        description:
          "Se reemplazará el texto actual con una nueva versión generada por IA.",
        confirmLabel: "Regenerar",
      });
      if (!ok) return;
    }
    await onRegenerate(instruction);
    setInstruction("");
  }

  return (
    <Sheet open={open} onOpenChange={(next) => void handleClose(next)}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:max-w-lg sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:right-4 sm:data-[side=bottom]:left-auto lg:max-h-[100dvh] lg:rounded-none lg:data-[side=bottom]:inset-y-0 lg:data-[side=bottom]:right-0 lg:data-[side=bottom]:top-0 lg:data-[side=bottom]:h-full lg:data-[side=bottom]:w-[28rem] lg:data-[side=bottom]:max-w-[28rem] lg:data-[side=bottom]:rounded-none"
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-ds-border-subtle px-4 pb-3 pt-4 pr-14 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="font-display text-[15px]">
                {auto ? section.title : "Ampliar sección"}
              </SheetTitle>
              <SheetDescription className="text-[12px] text-ds-text-3">
                {auto
                  ? "Se resuelve en cada preview y PDF desde el costeo vigente."
                  : "Modo foco. También podés editar inline en la tarjeta; los cambios se guardan al cerrar."}
              </SheetDescription>
            </div>
            {!readOnly && !auto ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 sm:h-9 sm:w-9"
                    disabled={busy}
                    aria-label="Más acciones de la sección"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove("up")}>
                    <ArrowUp className="h-4 w-4" />
                    Mover arriba
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove("down")}>
                    <ArrowDown className="h-4 w-4" />
                    Mover abajo
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSaveAsFixed()}>
                    <Save className="h-4 w-4" />
                    Guardar como fija
                  </DropdownMenuItem>
                  {!section.invariant ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-status-danger-fg focus:text-status-danger-fg"
                        onSelect={() => onDelete()}
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
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {auto ? (
            opening ? (
              <EconomicOpeningTable opening={opening} />
            ) : (
              <p className="text-[13px] text-ds-text-3">Sin costeo aún.</p>
            )
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="proposal-sheet-title">Título</Label>
                <Input
                  id="proposal-sheet-title"
                  value={title}
                  disabled={readOnly || Boolean(section.invariant) || busy}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 sm:h-9 font-display text-[15px]"
                />
              </div>
              {section.ref ? (
                <p className="text-[12px] text-status-info-fg">Ref. bases: {section.ref}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                <Tag variant="neutral" size="sm">
                  {section.status}
                </Tag>
                {section.origin ? (
                  <Tag variant="info" size="sm">
                    {section.origin}
                  </Tag>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposal-sheet-content">Contenido</Label>
                <Textarea
                  id="proposal-sheet-content"
                  value={content}
                  disabled={readOnly || busy}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="min-h-[220px] text-[13px]"
                />
              </div>
              {!readOnly ? (
                <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
                  <Label htmlFor="proposal-sheet-instruction">Instrucción (opcional)</Label>
                  <Input
                    id="proposal-sheet-instruction"
                    value={instruction}
                    disabled={busy}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Ej. Enfatiza la continuidad operacional"
                    className="h-10 sm:h-9"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full sm:h-9"
                    disabled={busy}
                    onClick={() => void handleRegenerate()}
                  >
                    {busy ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
                    Regenerar
                  </Button>
                </div>
              ) : null}
              {!readOnly && mode === "licitacion" ? (
                section.status === "aprobada" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full sm:h-9"
                    disabled={busy}
                    onClick={onUnapprove}
                  >
                    Quitar revisada
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full sm:h-9"
                    disabled={busy || !section.content.trim()}
                    onClick={onApprove}
                  >
                    Marcar revisada
                  </Button>
                )
              ) : null}
            </>
          )}
        </div>

        {!readOnly && !auto ? (
          <SheetFooter className="shrink-0 border-t border-ds-border-subtle px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button
              type="button"
              className="h-10 w-full sm:h-9"
              disabled={busy || !dirty}
              onClick={() => {
                void onSave(content, title);
              }}
            >
              {busy ? <Spinner size="sm" /> : null}
              {dirty ? "Guardar" : "Sin cambios"}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
