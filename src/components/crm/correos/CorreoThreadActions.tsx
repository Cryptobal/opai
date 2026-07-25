"use client";

import { Archive, Clock, Mail, MailOpen, Reply, ShieldAlert, Star, Trash2 } from "lucide-react";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { CorreoThreadActionsBar } from "./CorreoThreadActionsBar";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  /** ISO de destacado/spam del hilo (C11); undefined = no mostrar el botón. */
  starred?: boolean;
  inSpam?: boolean;
  canModify: boolean;
  variant?: "row" | "drawer" | "mobile-bar";
  /** drawer compacto: fila de iconos sin etiquetas (rediseño del lector). */
  compact?: boolean;
  onDone?: () => void;
  onReply?: () => void;
  /** Cierra el lector tras archivar/eliminar (drawer/mobile-bar). */
  onClose?: () => void;
  /** Abre el sheet de posponer (Bloque 3). */
  onSnooze?: () => void;
};

export function CorreoThreadActions({
  threadId,
  isUnread,
  archived,
  starred,
  inSpam,
  canModify,
  variant = "row",
  compact = false,
  onDone,
  onReply,
  onClose,
  onSnooze,
}: Props) {
  if (!canModify) return null;

  if (variant === "mobile-bar") {
    return (
      <CorreoThreadActionsBar
        threadId={threadId}
        isUnread={isUnread}
        archived={archived}
        onDone={onDone}
        onReply={onReply}
        onClose={onClose}
        onSnooze={onSnooze}
      />
    );
  }

  const drawer = variant === "drawer";
  // drawer compacto: fila de iconos (rediseño lector). drawer normal:
  // botones con etiqueta. row: icono que aparece en hover.
  const showLabel = drawer && !compact;
  const btn = compact
    ? "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-2 hover:bg-ds-surface-3 hover:text-ds-text-1 ds-tap"
    : drawer
      ? "inline-flex h-10 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
      : "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ds-surface-3 hover:text-ds-text-1 ds-tap";

  function act(action: CorreoAction, okMsg: string, undo?: CorreoAction) {
    void runCorreoAction(threadId, action, okMsg, onDone, undo);
  }

  // drawer: archivar/eliminar/spam cierran el lector y ofrecen "Deshacer".
  function closeAfter(action: "archive" | "trash" | "spam", okMsg: string) {
    void runCorreoAction(
      threadId,
      action,
      okMsg,
      onDone,
      action === "spam" ? "unspam" : "unarchive",
    );
    onClose?.();
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
        className={btn}
        title={archived ? "Desarchivar" : "Archivar"}
        onClick={() =>
          archived
            ? act("unarchive", "Restaurado a bandeja")
            : drawer
              ? closeAfter("archive", "Archivado")
              : act("archive", "Archivado", "unarchive")
        }
      >
        <Archive className="h-4 w-4" />
        {showLabel && <span>{archived ? "Desarchivar" : "Archivar"}</span>}
      </button>
      <button
        type="button"
        className={btn}
        title="Eliminar"
        onClick={() => {
          if (drawer) return closeAfter("trash", "Movido a la Papelera");
          // Sin confirm(): como Gmail, la papelera es directa y el toast
          // ofrece Deshacer (unarchive restaura a bandeja).
          act("trash", "Movido a la Papelera", "unarchive");
        }}
      >
        <Trash2 className="h-4 w-4" />
        {showLabel && <span>Eliminar</span>}
      </button>
      <button
        type="button"
        className={btn}
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
          className={btn}
          title="Posponer"
          onClick={() => onSnooze()}
        >
          <Clock className="h-4 w-4" />
        </button>
      )}
      {drawer && starred !== undefined && (
        <button
          type="button"
          className={btn}
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
      {drawer && inSpam !== undefined && (
        <button
          type="button"
          className={btn}
          title={inSpam ? "No es spam" : "Marcar spam"}
          onClick={() =>
            inSpam
              ? act("unspam", "Restaurado de Spam")
              : closeAfter("spam", "Marcado como spam")
          }
        >
          <ShieldAlert className="h-4 w-4" />
          {showLabel && <span>{inSpam ? "No es spam" : "Spam"}</span>}
        </button>
      )}
      {drawer && onSnooze && (
        <button type="button" className={btn} title="Posponer" onClick={() => onSnooze()}>
          <Clock className="h-4 w-4" />
          {showLabel && <span>Posponer</span>}
        </button>
      )}
      {drawer && onReply && !compact && (
        <button type="button" className={btn} title="Responder" onClick={() => onReply()}>
          <Reply className="h-4 w-4" />
          {showLabel && <span>Responder</span>}
        </button>
      )}
    </div>
  );
}
