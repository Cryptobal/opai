"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TareaDetailFields } from "./TareaDetailFields";
import type { DueValue } from "./TareaDueChips";
import type { TareaItem, TareaUpdateInput } from "./types";

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

const FOOTER_BTN = "flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-[13px]";

/**
 * Detalle editable de una tarea. Sheet inferior en móvil / diálogo centrado en
 * desktop (Radix Dialog: focus-trap, aria-modal, Escape). Título, detalles,
 * vencimiento y responsables se editan en borrador y persisten con "Guardar".
 * La posposición rápida con Deshacer vive en la lista (TareaRow), no aquí.
 */
export function TareaDetailSheet({
  task, users, canEdit, canDelete, onClose, onSave, onDelete, onToggle,
}: {
  task: TareaItem | null;
  users: AgendaTeamMember[];
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (id: string, input: TareaUpdateInput) => Promise<boolean>;
  onDelete: (id: string) => void;
  onToggle: (t: TareaItem) => void;
}) {
  const isMobile = useIsMobileViewport();
  const kb = useKeyboardOffset();
  const contentRef = useRef<HTMLDivElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<DueValue>({ dueAt: null, allDay: true });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPortalEl(contentRef.current);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDue({ dueAt: task.dueAt, allDay: task.allDay });
    setAssigneeIds(task.assigneeIds);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;
  const done = task.status === "done";
  const dueDirty = due.dueAt !== task.dueAt || due.allDay !== task.allDay;
  const dirty = canEdit && (
    title.trim() !== task.title ||
    (notes.trim() || null) !== (task.notes ?? null) ||
    dueDirty ||
    !sameIds(assigneeIds, task.assigneeIds)
  );

  const requestClose = async () => {
    if (dirty && !(await confirmDialog({
      title: "Descartar cambios",
      description: "Tienes cambios sin guardar en esta tarea. ¿Quieres descartarlos?",
      confirmLabel: "Descartar", cancelLabel: "Seguir editando", variant: "destructive",
    }))) return;
    onClose();
  };

  const save = async () => {
    if (!title.trim()) { toast.error("El título no puede quedar vacío"); return; }
    const input: TareaUpdateInput = {};
    if (title.trim() !== task.title) input.title = title.trim();
    const nextNotes = notes.trim() ? notes.trim() : null;
    if (nextNotes !== (task.notes ?? null)) input.notes = nextNotes;
    if (dueDirty) {
      input.dueAt = due.dueAt;
      input.allDay = due.allDay;
    }
    // No dejar la tarea sin responsables desde la UI: si queda vacío, no se toca.
    if (assigneeIds.length && !sameIds(assigneeIds, task.assigneeIds)) input.assigneeIds = assigneeIds;
    if (Object.keys(input).length === 0) { onClose(); return; }
    setSaving(true);
    const ok = await onSave(task.id, input);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) void requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 motion-safe:animate-in motion-safe:fade-in" />
        <Dialog.Content
          ref={contentRef}
          aria-label={`Detalle de tarea: ${task.title}`}
          style={isMobile && kb > 0 ? { bottom: kb, maxHeight: `calc(92vh - ${kb}px)` } : undefined}
          className={cn(
            // Desktop: card opaco. Mobile: liquid glass con underlay (ios-surface-dialog)
            // — sin opai-glass-strong solo, que dejaba leer el fondo a través del modal.
            // fixed es positioned → el popover absolute se ancla a este Dialog.Content.
            "fixed z-[70] flex flex-col border border-ds-border-default bg-card outline-none motion-safe:animate-in",
            "opai-ios-surface-dialog",
            isMobile
              ? "inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl rounded-b-none motion-safe:slide-in-from-bottom"
              : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-[620px] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-3xl motion-safe:fade-in",
          )}
        >
          {isMobile && <div className="mx-auto mt-2 h-1 w-[38px] shrink-0 rounded-full bg-ds-text-4/40" />}

          <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
            <button
              type="button" onClick={() => canEdit && onToggle(task)} disabled={!canEdit}
              aria-label={done ? "Marcar como pendiente" : "Completar tarea"}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                done ? "border-primary bg-primary text-primary-foreground" : "border-ds-border-default text-transparent hover:border-primary",
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <Dialog.Title className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ds-text-2">
              {done ? "Tarea completada" : "Detalle de tarea"}
            </Dialog.Title>
            <button
              type="button" onClick={() => void requestClose()} aria-label="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <TareaDetailFields
              task={task} canEdit={canEdit} title={title} notes={notes} due={due} assigneeIds={assigneeIds} users={users}
              onTitle={setTitle} onNotes={setNotes} onDue={setDue} onAssignees={setAssigneeIds}
              portalContainer={portalEl}
            />
          </div>

          {(canEdit || canDelete) && (
            <div
              className="flex shrink-0 items-center justify-between gap-2 border-t border-ds-border-subtle px-4 pt-3"
              style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
            >
              {canDelete ? (
                <button type="button" onClick={() => onDelete(task.id)} className={cn(FOOTER_BTN, "text-status-danger-fg hover:bg-status-danger-soft")}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              ) : (
                <span />
              )}
              {canEdit && (
                <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={cn(FOOTER_BTN, "bg-primary font-medium text-primary-foreground disabled:opacity-50")}>
                  Guardar
                </button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
