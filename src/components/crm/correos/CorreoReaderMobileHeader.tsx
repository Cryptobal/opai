"use client";

import type { ReactNode } from "react";
import {
  Archive,
  ChevronLeft,
  ListChecks,
  Mail,
  MailOpen,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCorreoReaderScroll } from "./CorreoReaderScrollContext";
import { useCorreoWorkOptional } from "./CorreoWorkContext";

type Props = {
  subject: string;
  onClose: () => void;
  /** Slot del menú "⋯" (Más acciones). */
  moreSlot?: ReactNode;
  /** Pager opcional (anterior / siguiente hilo). */
  pager?: ReactNode;
  /** Acciones de hilo (solo con detalle listo + canModify). */
  threadActions?: {
    isUnread: boolean;
    archived: boolean;
    trashed: boolean;
    starred: boolean;
    onArchive: () => void;
    onTrash: () => void;
    onToggleRead: () => void;
    onToggleStar: () => void;
    onOpenTasks: () => void;
  } | null;
};

/**
 * Header adaptativo del lector móvil (`<lg`). En reposo: transparente, Volver
 * + acciones de hilo + `⋯`. Al scrollear (`scrolled`): glass + asunto truncado.
 * Patrón: Archivar · Eliminar · Leído · Destacar · Tareas · ⋯.
 */
export function CorreoReaderMobileHeader({
  subject,
  onClose,
  moreSlot,
  pager,
  threadActions,
}: Props) {
  const { scrolled } = useCorreoReaderScroll();
  const work = useCorreoWorkOptional();
  const openTasks = (work?.tasks.data ?? []).filter((t) => t.status !== "done").length;
  const a = threadActions;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 shrink-0 px-1.5 pt-[calc(env(safe-area-inset-top)+0.25rem)] lg:hidden",
        "transition-[background-color,border-color,backdrop-filter] duration-200 [transition-timing-function:cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
        scrolled
          ? "opai-glass-strong rounded-none border-0 border-b border-ds-border-subtle"
          : "border-0 border-b border-transparent bg-transparent",
      )}
    >
      <div className="flex h-11 items-center gap-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="min-w-0 flex-1 px-0.5 text-center">
          {scrolled ? (
            <p className="truncate font-display text-[12.5px] font-semibold text-ds-text-1">
              {subject || "(sin asunto)"}
            </p>
          ) : null}
        </div>

        {pager}

        {a && (
          <>
            <HeaderIconBtn
              label={a.archived ? "Desarchivar" : "Archivar"}
              onClick={a.onArchive}
            >
              <Archive className="h-5 w-5" />
            </HeaderIconBtn>
            <HeaderIconBtn
              label={a.trashed ? "Restaurar" : "Eliminar"}
              onClick={a.onTrash}
              tone="danger"
            >
              {a.trashed ? <Undo2 className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            </HeaderIconBtn>
            <HeaderIconBtn
              label={a.isUnread ? "Marcar leído" : "Marcar no leído"}
              onClick={a.onToggleRead}
            >
              {a.isUnread ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            </HeaderIconBtn>
            <HeaderIconBtn
              label={a.starred ? "Quitar destacado" : "Destacar"}
              onClick={a.onToggleStar}
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  a.starred && "fill-status-warn-fg text-status-warn-fg",
                )}
              />
            </HeaderIconBtn>
            <HeaderIconBtn label="Tareas" onClick={a.onOpenTasks}>
              <span className="relative inline-flex">
                <ListChecks className="h-5 w-5" />
                {openTasks > 0 && (
                  <span
                    className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-semibold leading-none text-primary-foreground tabular-nums"
                    aria-hidden
                  >
                    {openTasks > 9 ? "9+" : openTasks}
                  </span>
                )}
              </span>
            </HeaderIconBtn>
          </>
        )}

        {moreSlot ?? <span className="h-11 w-10 shrink-0" aria-hidden />}
      </div>
    </header>
  );
}

function HeaderIconBtn({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap",
        "transition-colors motion-reduce:transition-none",
        tone === "danger"
          ? "hover:bg-status-danger-soft hover:text-status-danger-fg"
          : "hover:bg-primary/10 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
