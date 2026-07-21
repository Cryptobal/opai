import { toast } from "sonner";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";

async function postAction(threadId: string, action: CorreoAction, snoozeUntil?: string) {
  const res = await fetch(`/api/crm/correos/${threadId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snoozeUntil ? { action, snoozeUntil } : { action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Error");
}

/**
 * Pospone un hilo hasta `until` (ISO). Espeja en Gmail (sale de INBOX) y ofrece
 * "Deshacer" (unsnooze). `onDone` refresca lista/counts en background.
 */
export async function snoozeThread(
  threadId: string,
  until: string,
  okMsg: string,
  onDone?: () => void,
) {
  try {
    await postAction(threadId, "snooze", until);
    toast.success(okMsg, {
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => void postAction(threadId, "unsnooze").then(() => onDone?.()),
      },
    });
    onDone?.();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo posponer");
  }
}

export async function runCorreoAction(
  threadId: string,
  action: CorreoAction,
  okMsg: string,
  onDone?: () => void,
  undo?: CorreoAction,
) {
  try {
    await postAction(threadId, action);
    if (undo) {
      toast.success(okMsg, {
        duration: 5000,
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
