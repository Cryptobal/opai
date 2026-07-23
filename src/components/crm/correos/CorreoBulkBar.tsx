"use client";

/**
 * Barra de acciones masivas (C12, PR-14): aparece con ≥1 hilo seleccionado.
 * Archivar / leer / no leer / destacar / spam / papelera / posponer sobre la
 * selección, server-side en un solo request, con "Deshacer" para las
 * destructivas. Seleccionar 50 hilos y archivarlos = 1 acción.
 */

import { Archive, CheckSquare, Clock, Mail, MailOpen, ShieldAlert, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";

async function postBulk(
  threadIds: string[],
  action: CorreoAction,
  snoozeUntil?: string,
): Promise<{ ok: boolean; applied: number; failed: string[] }> {
  const res = await fetch("/api/crm/correos/bulk-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadIds, action, ...(snoozeUntil ? { snoozeUntil } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    applied?: number;
    failed?: string[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || "Error");
  return { ok: body.ok !== false, applied: body.applied ?? 0, failed: body.failed ?? [] };
}

export function runBulkCorreoAction(params: {
  threadIds: string[];
  action: CorreoAction;
  okMsg: string;
  undo?: CorreoAction;
  snoozeUntil?: string;
  onDone?: () => void;
}) {
  const { threadIds } = params;
  void postBulk(threadIds, params.action, params.snoozeUntil)
    .then((result) => {
      const message = `${params.okMsg} (${result.applied})`;
      if (params.undo) {
        toast.success(message, {
          duration: 6000,
          action: {
            label: "Deshacer",
            onClick: () =>
              void postBulk(threadIds, params.undo!).then(() => params.onDone?.()),
          },
        });
      } else {
        toast.success(message);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} hilos no se pudieron actualizar`);
      }
      params.onDone?.();
    })
    .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo completar"));
}

type Props = {
  count: number;
  onClear: () => void;
  onSelectAllVisible: () => void;
  onAction: (
    action: CorreoAction,
    okMsg: string,
    opts?: { undo?: CorreoAction; removes?: boolean },
  ) => void;
  onSnooze: () => void;
};

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-primary-foreground/90 ds-tap hover:bg-primary-foreground/10";

export function CorreoBulkBar({ count, onClear, onSelectAllVisible, onAction, onSnooze }: Props) {
  return (
    // v2: en móvil la selección usa CorreoSelectionBar; esta barra es desktop.
    <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 hidden flex-wrap items-center gap-1 rounded-xl bg-primary px-2 py-1.5 text-primary-foreground shadow-lg lg:top-2 lg:flex">
      <button type="button" aria-label="Deseleccionar todo" onClick={onClear} className={BTN}>
        <X className="h-4 w-4" />
      </button>
      <span className="text-[13px] font-medium">{count} seleccionados</span>
      <button type="button" onClick={onSelectAllVisible} className={BTN}>
        <CheckSquare className="h-4 w-4" /> <span className="hidden sm:inline">Todos</span>
      </button>
      <span className="mx-1 h-5 w-px bg-primary-foreground/25" aria-hidden />
      <button
        type="button"
        title="Archivar"
        onClick={() => onAction("archive", "Archivados", { undo: "unarchive", removes: true })}
        className={BTN}
      >
        <Archive className="h-4 w-4" /> <span className="hidden sm:inline">Archivar</span>
      </button>
      <button
        type="button"
        title="Marcar leído"
        onClick={() => onAction("markRead", "Marcados como leídos")}
        className={BTN}
      >
        <MailOpen className="h-4 w-4" /> <span className="hidden md:inline">Leído</span>
      </button>
      <button
        type="button"
        title="Marcar no leído"
        onClick={() => onAction("markUnread", "Marcados como no leídos")}
        className={BTN}
      >
        <Mail className="h-4 w-4" /> <span className="hidden md:inline">No leído</span>
      </button>
      <button
        type="button"
        title="Destacar"
        onClick={() => onAction("star", "Destacados", { undo: "unstar" })}
        className={BTN}
      >
        <Star className="h-4 w-4" /> <span className="hidden md:inline">Destacar</span>
      </button>
      <button type="button" title="Posponer" onClick={onSnooze} className={BTN}>
        <Clock className="h-4 w-4" /> <span className="hidden md:inline">Posponer</span>
      </button>
      <button
        type="button"
        title="Marcar spam"
        onClick={() => onAction("spam", "Marcados como spam", { undo: "unspam", removes: true })}
        className={BTN}
      >
        <ShieldAlert className="h-4 w-4" /> <span className="hidden md:inline">Spam</span>
      </button>
      <button
        type="button"
        title="Mover a papelera"
        onClick={() => onAction("trash", "Movidos a la Papelera", { undo: "unarchive", removes: true })}
        className={BTN}
      >
        <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Eliminar</span>
      </button>
    </div>
  );
}
