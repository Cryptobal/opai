"use client";

import { Archive, Mail, MailOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  canModify: boolean;
  variant?: "row" | "drawer";
  onDone?: () => void;
};

async function postAction(threadId: string, action: CorreoAction) {
  const res = await fetch(`/api/crm/correos/${threadId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Error");
}

export function CorreoThreadActions({
  threadId,
  isUnread,
  archived,
  canModify,
  variant = "row",
  onDone,
}: Props) {
  if (!canModify) return null;

  async function run(action: CorreoAction, okMsg: string, undo?: CorreoAction) {
    try {
      await postAction(threadId, action);
      if (undo) {
        toast.success(okMsg, {
          action: {
            label: "Deshacer",
            onClick: () => void postAction(threadId, undo).then(() => onDone?.()),
          },
        });
      } else toast.success(okMsg);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
    }
  }

  const drawer = variant === "drawer";
  const btn = drawer
    ? "inline-flex h-10 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
    : "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ds-surface-3 hover:text-ds-text-1 ds-tap";

  return (
    <div className={drawer ? "flex flex-wrap gap-2" : "flex items-center gap-0.5"} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={btn}
        title={archived ? "Desarchivar" : "Archivar"}
        onClick={() =>
          void run(
            archived ? "unarchive" : "archive",
            archived ? "Restaurado a bandeja" : "Archivado",
            archived ? undefined : "unarchive",
          )
        }
      >
        <Archive className="h-4 w-4" />
        {drawer && <span>{archived ? "Desarchivar" : "Archivar"}</span>}
      </button>
      <button
        type="button"
        className={btn}
        title="Eliminar"
        onClick={() => {
          if (confirm("¿Mover a la Papelera de Gmail?")) void run("trash", "Movido a la Papelera");
        }}
      >
        <Trash2 className="h-4 w-4" />
        {drawer && <span>Eliminar</span>}
      </button>
      <button
        type="button"
        className={btn}
        title={isUnread ? "Marcar leído" : "Marcar no leído"}
        onClick={() =>
          void run(
            isUnread ? "markRead" : "markUnread",
            isUnread ? "Marcado como leído" : "Marcado como no leído",
          )
        }
      >
        {isUnread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        {drawer && <span>{isUnread ? "Leído" : "No leído"}</span>}
      </button>
    </div>
  );
}
