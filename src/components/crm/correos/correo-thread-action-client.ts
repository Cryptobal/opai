import { toast } from "sonner";
import { showUndo, DEFAULT_UNDO_DURATION_MS } from "@/components/opai-ds";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { queueOfflineAction } from "./offline-store";

/** Lee la preferencia de duración del undo (localStorage) sin acoplar al hook. */
export function correoUndoDurationMs(): number {
  if (typeof window === "undefined") return DEFAULT_UNDO_DURATION_MS;
  try {
    const raw = localStorage.getItem("opai.crm.correos.view.v1");
    if (!raw) return DEFAULT_UNDO_DURATION_MS;
    const parsed = JSON.parse(raw) as { undoSeconds?: unknown };
    const seconds = parsed.undoSeconds;
    if (seconds === 5 || seconds === 10 || seconds === 15 || seconds === 30) {
      return seconds * 1000;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_UNDO_DURATION_MS;
}

async function postAction(threadId: string, action: CorreoAction, snoozeUntil?: string) {
  let res: Response;
  try {
    res = await fetch(`/api/crm/correos/${threadId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snoozeUntil ? { action, snoozeUntil } : { action }),
    });
  } catch {
    // C22b: sin red — encolar localmente y reconciliar al reconectar.
    await queueOfflineAction({ threadId, action, snoozeUntil });
    toast.message("Sin conexión: la acción se aplicará al reconectar");
    return;
  }
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
    showUndo({
      message: okMsg,
      durationMs: correoUndoDurationMs(),
      onUndo: () => void postAction(threadId, "unsnooze").then(() => onDone?.()),
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
): Promise<boolean> {
  try {
    await postAction(threadId, action);
    if (undo) {
      showUndo({
        message: okMsg,
        durationMs: correoUndoDurationMs(),
        onUndo: () => void postAction(threadId, undo).then(() => onDone?.()),
      });
    } else {
      toast.success(okMsg);
    }
    onDone?.();
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo completar");
    return false;
  }
}
