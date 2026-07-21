"use client";

import { Archive, Mail, MailOpen, Trash2 } from "lucide-react";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { CorreoThreadActionsBar } from "./CorreoThreadActionsBar";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  canModify: boolean;
  variant?: "row" | "drawer" | "mobile-bar";
  onDone?: () => void;
  onReply?: () => void;
};

export function CorreoThreadActions({
  threadId,
  isUnread,
  archived,
  canModify,
  variant = "row",
  onDone,
  onReply,
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
      />
    );
  }

  const drawer = variant === "drawer";
  const btn = drawer
    ? "inline-flex h-10 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
    : "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ds-surface-3 hover:text-ds-text-1 ds-tap";

  function act(action: CorreoAction, okMsg: string, undo?: CorreoAction) {
    void runCorreoAction(threadId, action, okMsg, onDone, undo);
  }

  return (
    <div
      className={drawer ? "hidden flex-wrap gap-2 md:flex" : "hidden items-center gap-0.5 md:flex"}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={btn}
        title={archived ? "Desarchivar" : "Archivar"}
        onClick={() => act(archived ? "unarchive" : "archive", archived ? "Restaurado a bandeja" : "Archivado", archived ? undefined : "unarchive")}
      >
        <Archive className="h-4 w-4" />
        {drawer && <span>{archived ? "Desarchivar" : "Archivar"}</span>}
      </button>
      <button
        type="button"
        className={btn}
        title="Eliminar"
        onClick={() => {
          if (confirm("¿Mover a la Papelera de Gmail?")) act("trash", "Movido a la Papelera");
        }}
      >
        <Trash2 className="h-4 w-4" />
        {drawer && <span>Eliminar</span>}
      </button>
      <button
        type="button"
        className={btn}
        title={isUnread ? "Marcar leído" : "Marcar no leído"}
        onClick={() => act(isUnread ? "markRead" : "markUnread", isUnread ? "Marcado como leído" : "Marcado como no leído")}
      >
        {isUnread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        {drawer && <span>{isUnread ? "Leído" : "No leído"}</span>}
      </button>
    </div>
  );
}
