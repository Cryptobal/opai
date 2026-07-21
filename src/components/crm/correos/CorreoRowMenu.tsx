"use client";

import { Archive, Clock, Mail, MailOpen, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { runCorreoAction } from "./correo-thread-action-client";

/**
 * Menú kebab de una fila de correo (móvil): marcar leído/no leído, posponer,
 * archivar y eliminar. Archivar/Eliminar remueven la fila de forma optimista y
 * ofrecen "Deshacer". "Posponer" abre el sheet (sólo si `onSnooze` está listo).
 */
export function CorreoRowMenu({
  thread,
  onChanged,
  onRemove,
  onSnooze,
}: {
  thread: CorreoThreadDTO;
  onChanged?: () => void;
  onRemove?: (id: string) => void;
  onSnooze?: () => void;
}) {
  const unread = thread.isUnread;

  function remove(action: "archive" | "trash", okMsg: string) {
    onRemove?.(thread.id);
    void runCorreoAction(thread.id, action, okMsg, onChanged, "unarchive");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Acciones"
          onClick={(e) => e.stopPropagation()}
          className="flex h-11 w-9 items-center justify-center text-ds-text-3 ds-tap"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          onSelect={() =>
            void runCorreoAction(
              thread.id,
              unread ? "markRead" : "markUnread",
              unread ? "Marcado como leído" : "Marcado como no leído",
              onChanged,
            )
          }
        >
          {unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          {unread ? "Marcar leído" : "Marcar no leído"}
        </DropdownMenuItem>
        {onSnooze && (
          <DropdownMenuItem onSelect={() => onSnooze()}>
            <Clock className="h-4 w-4" /> Posponer
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => remove("archive", "Archivado")}>
          <Archive className="h-4 w-4" /> Archivar
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-status-danger-fg"
          onSelect={() => remove("trash", "Movido a la Papelera")}
        >
          <Trash2 className="h-4 w-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
