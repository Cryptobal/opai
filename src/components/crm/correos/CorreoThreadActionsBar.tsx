"use client";

import { Archive, Clock, Mail, MailOpen, Reply, Trash2 } from "lucide-react";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  onDone?: () => void;
  onReply?: () => void;
  /** Cierra el lector tras archivar/eliminar (vuelve a la lista). */
  onClose?: () => void;
  /** Remoción optimista de la fila (+ cierre en móvil). */
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  /** Abre el sheet de posponer (Bloque 3). */
  onSnooze?: () => void;
};

/**
 * Barra inferior sticky móvil del lector: archivar · eliminar · leído ·
 * [posponer] · responder. Archivar/Eliminar cierran el lector y ofrecen
 * "Deshacer" — nunca dejan al usuario mirando un hilo que ya salió.
 */
export function CorreoThreadActionsBar({
  threadId,
  isUnread,
  archived,
  onDone,
  onReply,
  onClose,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onSnooze,
}: Props) {
  const item =
    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[12px] text-ds-text-2 ds-tap";

  function closeAfter(action: "archive" | "trash", okMsg: string) {
    // UI primero (sacar fila / volver a bandeja); luego red + Deshacer.
    if (onRemove) onRemove(threadId);
    else onClose?.();
    void runCorreoAction(
      threadId,
      action,
      okMsg,
      onRemoveDone ?? onDone,
      "unarchive",
      onUndoDone,
    );
  }

  const cols = onSnooze ? "grid-cols-5" : "grid-cols-4";

  return (
    <div className={`grid h-full ${cols} gap-1`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={item}
        onClick={() =>
          archived
            ? void runCorreoAction(threadId, "unarchive", "Restaurado a bandeja", onDone)
            : closeAfter("archive", "Archivado")
        }
      >
        <Archive className="h-4 w-4" />
        <span>{archived ? "Desarchivar" : "Archivar"}</span>
      </button>
      <button type="button" className={item} onClick={() => closeAfter("trash", "Movido a la Papelera")}>
        <Trash2 className="h-4 w-4" />
        <span>Eliminar</span>
      </button>
      <button
        type="button"
        className={item}
        onClick={() =>
          void runCorreoAction(
            threadId,
            isUnread ? "markRead" : "markUnread",
            isUnread ? "Marcado como leído" : "Marcado como no leído",
            onDone,
            isUnread ? "markUnread" : "markRead",
          )
        }
      >
        {isUnread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        <span>{isUnread ? "Leído" : "No leído"}</span>
      </button>
      {onSnooze && (
        <button type="button" className={item} onClick={() => onSnooze()}>
          <Clock className="h-4 w-4" />
          <span>Posponer</span>
        </button>
      )}
      <button type="button" className={item} onClick={() => onReply?.()}>
        <Reply className="h-4 w-4" />
        <span>Responder</span>
      </button>
    </div>
  );
}
