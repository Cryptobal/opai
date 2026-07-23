"use client";

/**
 * Cliente del envío por outbox (PR-12): POST a /api/crm/gmail/send con
 * `idempotencyKey` (reintentos = 1 solo correo), y toasts de "Enviando…
 * Deshacer" / "Programado" con cancelación dentro de la ventana.
 */

import { toast } from "sonner";

export type CrmEmailQueuedData = {
  outboxId: string;
  status: string;
  undoUntil: string | null;
  scheduledAt: string | null;
  undoWindowMs: number;
  duplicate: boolean;
};

export type CrmEmailSendResult =
  | { ok: true; queued: true; data: CrmEmailQueuedData }
  | {
      ok: true;
      queued: false;
      warning?: string;
      data: { threadId: string | null; messageId: string | null; providerMessageId: string | null };
    }
  | { ok: false; error: string };

export function newEmailIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function sendCrmEmail(
  body: Record<string, unknown>,
): Promise<CrmEmailSendResult> {
  try {
    const res = await fetch("/api/crm/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      queued?: boolean;
      error?: string;
      warning?: string;
      data?: unknown;
    };
    if (!res.ok || data.success === false) {
      return { ok: false, error: data.error || "No se pudo enviar el correo" };
    }
    if (data.queued) {
      return { ok: true, queued: true, data: data.data as CrmEmailQueuedData };
    }
    return {
      ok: true,
      queued: false,
      warning: data.warning,
      data: (data.data ?? {
        threadId: null,
        messageId: null,
        providerMessageId: null,
      }) as { threadId: string | null; messageId: string | null; providerMessageId: string | null },
    };
  } catch {
    return { ok: false, error: "No se pudo enviar el correo" };
  }
}

async function cancelOutboxSend(outboxId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/crm/gmail/outbox/${outboxId}/cancel`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return res.ok && data.success === true;
  } catch {
    return false;
  }
}

/**
 * Toast post-encolado: "Enviando… Deshacer (Ns)" o confirmación de programado
 * con opción de cancelar. `onUndone` permite al composer restaurar el borrador.
 */
export function notifyEmailQueued(
  data: CrmEmailQueuedData,
  opts?: { onUndone?: () => void },
) {
  const undo = async () => {
    const cancelled = await cancelOutboxSend(data.outboxId);
    if (cancelled) {
      toast.success("Envío cancelado");
      opts?.onUndone?.();
    } else {
      toast.error("Ya no se puede deshacer: el correo salió");
    }
  };

  if (data.scheduledAt) {
    const when = new Date(data.scheduledAt).toLocaleString("es-CL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    toast.success(`Envío programado para ${when}`, {
      action: { label: "Cancelar", onClick: () => void undo() },
      duration: 8000,
    });
    return;
  }

  const seconds = Math.max(Math.round(data.undoWindowMs / 1000), 1);
  toast(`Enviando… podés deshacer durante ${seconds} s`, {
    action: { label: "Deshacer", onClick: () => void undo() },
    duration: data.undoWindowMs,
  });
}

/** Presets de "Programar envío": mañana 9:00 y próximo lunes 9:00 (hora local). */
export function scheduleSendPresets(now = new Date()): Array<{
  key: string;
  label: string;
  date: Date;
}> {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextMonday = new Date(now);
  const day = nextMonday.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  return [
    { key: "tomorrow", label: "Mañana 9:00", date: tomorrow },
    { key: "monday", label: "Próximo lunes 9:00", date: nextMonday },
  ];
}
