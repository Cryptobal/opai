"use client";

import { Archive, Mail, MailOpen, Reply, Trash2 } from "lucide-react";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  onDone?: () => void;
  onReply?: () => void;
};

/** Barra inferior sticky mobile: archivar, eliminar, leído, responder. */
export function CorreoThreadActionsBar({ threadId, isUnread, archived, onDone, onReply }: Props) {
  const item =
    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[12px] text-ds-text-2 ds-tap";

  return (
    <div className="grid h-full grid-cols-4 gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={item}
        onClick={() =>
          void runCorreoAction(
            threadId,
            archived ? "unarchive" : "archive",
            archived ? "Restaurado a bandeja" : "Archivado",
            onDone,
            archived ? undefined : "unarchive",
          )
        }
      >
        <Archive className="h-4 w-4" />
        <span>{archived ? "Desarchivar" : "Archivar"}</span>
      </button>
      <button
        type="button"
        className={item}
        onClick={() => {
          if (confirm("¿Mover a la Papelera de Gmail?")) {
            void runCorreoAction(threadId, "trash", "Movido a la Papelera", onDone);
          }
        }}
      >
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
          )
        }
      >
        {isUnread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        <span>{isUnread ? "Leído" : "No leído"}</span>
      </button>
      <button type="button" className={item} onClick={() => onReply?.()}>
        <Reply className="h-4 w-4" />
        <span>Responder</span>
      </button>
    </div>
  );
}
