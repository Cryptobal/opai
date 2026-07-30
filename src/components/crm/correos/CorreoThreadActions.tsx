"use client";

import { Archive, Clock, Mail, MailOpen, Reply, ShieldAlert, Star, Trash2, Undo2 } from "lucide-react";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  /** En Papelera: el botón de eliminar pasa a restaurar. */
  trashed?: boolean;
  /** ISO de posponer vigente; si activo, el reloj ofrece "Dejar de posponer". */
  snoozedUntil?: string | null;
  /** ISO de destacado/spam del hilo (C11); undefined = no mostrar el botón. */
  starred?: boolean;
  inSpam?: boolean;
  canModify: boolean;
  variant?: "row" | "drawer";
  /** drawer compacto: fila de iconos sin etiquetas (rediseño del lector). */
  compact?: boolean;
  onDone?: () => void;
  /** Refresh tras archivar/eliminar (suave); por defecto `onDone`. */
  onRemoveDone?: () => void;
  /** Refresh al Deshacer (p. ej. rehidratar lista tras archivar optimista). */
  onUndoDone?: () => void;
  onReply?: () => void;
  /** Cierra el lector tras archivar/eliminar (drawer). */
  onClose?: () => void;
  /**
   * Remoción optimista + avance al siguiente hilo (desktop split / fila).
   * Si está definido, se prefiere sobre `onClose` al archivar/eliminar.
   */
  onRemove?: (threadId: string) => void;
  /** Abre el sheet de posponer (Bloque 3). */
  onSnooze?: () => void;
};

/** Hover con tinte brand para saber dónde queda el cursor al recorrer la barra. */
const HOVER_BRAND = "hover:bg-primary/15 hover:text-primary";
const HOVER_DANGER = "hover:bg-status-danger-soft hover:text-status-danger-fg";
const HOVER_WARN = "hover:bg-status-warn-soft hover:text-status-warn-fg";

export function CorreoThreadActions({
  threadId,
  isUnread,
  archived,
  trashed = false,
  snoozedUntil = null,
  starred,
  inSpam,
  canModify,
  variant = "row",
  compact = false,
  onDone,
  onRemoveDone,
  onUndoDone,
  onReply,
  onClose,
  onRemove,
  onSnooze,
}: Props) {
  if (!canModify) return null;

  const snoozeActive =
    snoozedUntil != null && new Date(snoozedUntil).getTime() > Date.now();

  const drawer = variant === "drawer";
  // drawer compacto: fila de iconos (rediseño lector). drawer normal:
  // botones con etiqueta. row: icono que aparece en hover.
  const showLabel = drawer && !compact;
  const btnBase = compact
    ? "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-2 transition-colors ds-tap"
    : drawer
      ? "inline-flex h-10 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] transition-colors ds-tap sm:h-9"
      : "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 opacity-0 transition-opacity transition-colors group-hover:opacity-100 ds-tap";

  function btn(hover: string = HOVER_BRAND) {
    return `${btnBase} ${hover}`;
  }

  function act(action: CorreoAction, okMsg: string, undo?: CorreoAction) {
    void runCorreoAction(threadId, action, okMsg, onDone, undo, onUndoDone);
  }

  /** Archivar/eliminar: remoción optimista (+ avance) o cierre del lector. */
  function removeAfter(action: "archive" | "trash" | "spam", okMsg: string) {
    // Primero UI (sacar fila / avanzar lector); luego red + undo.
    onRemove?.(threadId);
    const undo =
      action === "spam" ? "unspam" : action === "trash" ? "untrash" : "unarchive";
    void runCorreoAction(
      threadId,
      action,
      okMsg,
      onRemoveDone ?? onDone,
      undo,
      onUndoDone,
    );
    if (!onRemove) onClose?.();
  }

  function restoreAfter(action: "untrash" | "unsnooze", okMsg: string) {
    onRemove?.(threadId);
    void runCorreoAction(
      threadId,
      action,
      okMsg,
      onRemoveDone ?? onDone,
      undefined,
      onUndoDone,
    );
    if (!onRemove) onClose?.();
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-0.5"
          : drawer
            ? "hidden flex-wrap gap-2 md:flex"
            : "hidden items-center gap-0.5 md:flex"
      }
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={btn()}
        title={archived ? "Desarchivar" : "Archivar"}
        onClick={() =>
          archived
            ? act("unarchive", "Restaurado a bandeja")
            : removeAfter("archive", "Archivado")
        }
      >
        <Archive className="h-4 w-4" />
        {showLabel && <span>{archived ? "Desarchivar" : "Archivar"}</span>}
      </button>
      <button
        type="button"
        className={btn(trashed ? HOVER_BRAND : HOVER_DANGER)}
        title={trashed ? "Quitar de la Papelera" : "Eliminar"}
        onClick={() => {
          if (trashed) {
            restoreAfter("untrash", "Restaurado a bandeja");
            return;
          }
          // Sin confirm(): como Gmail, la papelera es directa y el toast
          // ofrece Deshacer (untrash restaura a bandeja).
          removeAfter("trash", "Movido a la Papelera");
        }}
      >
        {trashed ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
        {showLabel && <span>{trashed ? "Restaurar" : "Eliminar"}</span>}
      </button>
      <button
        type="button"
        className={btn()}
        title={isUnread ? "Marcar leído" : "Marcar no leído"}
        onClick={() =>
          act(
            isUnread ? "markRead" : "markUnread",
            isUnread ? "Marcado como leído" : "Marcado como no leído",
            isUnread ? "markUnread" : "markRead",
          )
        }
      >
        {isUnread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        {showLabel && <span>{isUnread ? "Leído" : "No leído"}</span>}
      </button>
      {!drawer && onSnooze && (
        <button
          type="button"
          className={btn(HOVER_WARN)}
          title={snoozeActive ? "Dejar de posponer" : "Posponer"}
          onClick={() =>
            snoozeActive
              ? restoreAfter("unsnooze", "Dejado de posponer")
              : onSnooze()
          }
        >
          <Clock className="h-4 w-4" />
        </button>
      )}
      {starred !== undefined && (
        <button
          type="button"
          className={btn(HOVER_WARN)}
          title={starred ? "Quitar destacado" : "Destacar"}
          onClick={() =>
            act(
              starred ? "unstar" : "star",
              starred ? "Quitado de Destacados" : "Destacado",
            )
          }
        >
          <Star className={`h-4 w-4 ${starred ? "fill-status-warn-fg text-status-warn-fg" : ""}`} />
          {showLabel && <span>{starred ? "Destacado" : "Destacar"}</span>}
        </button>
      )}
      {inSpam !== undefined && (
        <button
          type="button"
          className={btn(HOVER_DANGER)}
          title={inSpam ? "No es spam" : "Marcar spam"}
          onClick={() =>
            inSpam
              ? act("unspam", "Restaurado de Spam")
              : removeAfter("spam", "Marcado como spam")
          }
        >
          <ShieldAlert className="h-4 w-4" />
          {showLabel && <span>{inSpam ? "No es spam" : "Spam"}</span>}
        </button>
      )}
      {drawer && onSnooze && (
        <button
          type="button"
          className={btn(HOVER_WARN)}
          title={snoozeActive ? "Dejar de posponer" : "Posponer"}
          onClick={() =>
            snoozeActive
              ? restoreAfter("unsnooze", "Dejado de posponer")
              : onSnooze()
          }
        >
          <Clock className="h-4 w-4" />
          {showLabel && <span>{snoozeActive ? "Despertar" : "Posponer"}</span>}
        </button>
      )}
      {drawer && onReply && !compact && (
        <button type="button" className={btn()} title="Responder" onClick={() => onReply()}>
          <Reply className="h-4 w-4" />
          {showLabel && <span>Responder</span>}
        </button>
      )}
    </div>
  );
}
