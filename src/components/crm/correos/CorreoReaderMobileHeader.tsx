"use client";

import type { ReactNode } from "react";
import {
  Archive,
  ChevronLeft,
  Mail,
  MailOpen,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCorreoReaderScroll } from "./CorreoReaderScrollContext";

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
    onArchive: () => void;
    onTrash: () => void;
    onToggleRead: () => void;
    copilotPending: boolean;
    onOpenCopilot: () => void;
  } | null;
};

/**
 * Header adaptativo del lector móvil (`<lg`). En reposo: transparente, Volver
 * + acciones de hilo + `⋯` (centro vacío). Al scrollear (`scrolled`): glass +
 * asunto truncado. Patrón Gmail: Archivar · Eliminar · Leído · ✨ · ⋯.
 */
export function CorreoReaderMobileHeader({
  subject,
  onClose,
  moreSlot,
  pager,
  threadActions,
}: Props) {
  const { scrolled } = useCorreoReaderScroll();
  const a = threadActions;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 shrink-0 px-2 pt-[calc(env(safe-area-inset-top)+0.375rem)] lg:hidden",
        "transition-[background-color,border-color,backdrop-filter] duration-200 [transition-timing-function:cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
        scrolled
          ? "opai-glass-strong rounded-none border-0 border-b border-ds-border-subtle"
          : "border-0 border-b border-transparent bg-transparent",
      )}
    >
      <div className="flex h-[46px] items-center gap-0.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap"
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
            <HeaderIconBtn label="Copiloto" onClick={a.onOpenCopilot}>
              <span className="relative inline-flex">
                <Sparkles className="h-5 w-5" />
                {a.copilotPending && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-tint-violet"
                    aria-hidden
                  />
                )}
              </span>
            </HeaderIconBtn>
          </>
        )}

        {moreSlot ?? <span className="h-11 w-11 shrink-0" aria-hidden />}
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
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap",
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
