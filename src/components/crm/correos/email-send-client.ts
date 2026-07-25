"use client";

/**
 * Cliente del envío por outbox (PR-12): POST a /api/crm/gmail/send con
 * `idempotencyKey` (reintentos = 1 solo correo), y toasts de "Enviando…
 * Deshacer" / "Programado" con cancelación dentro de la ventana.
 */

import { toast } from "sonner";
import { showUndo } from "@/components/opai-ds";

export type CrmEmailQueuedData = {
  outboxId: string;
  status: string;
  undoUntil: string | null;
  scheduledAt: string | null;
  undoWindowMs: number;
  duplicate: boolean;
};

export type CrmEmailSendResult =
  | { ok: true; queued: true; offline?: false; data: CrmEmailQueuedData }
  | {
      ok: true;
      queued: false;
      offline?: false;
      warning?: string;
      data: { threadId: string | null; messageId: string | null; providerMessageId: string | null };
    }
  /** C22b: sin red — quedó en la cola local y saldrá (una sola vez) al reconectar. */
  | { ok: true; queued: true; offline: true }
  | { ok: false; error: string };

export function newEmailIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function sendCrmEmail(
  body: Record<string, unknown>,
): Promise<CrmEmailSendResult> {
  let res: Response;
  try {
    res = await fetch("/api/crm/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // C22b: sin red — a la cola local. El idempotencyKey ya viaja en el body,
    // así el flush al reconectar no puede duplicar el envío.
    if (typeof body.idempotencyKey === "string") {
      const { queueOfflineSend } = await import("./offline-store");
      await queueOfflineSend(body);
      return { ok: true, queued: true, offline: true };
    }
    return { ok: false, error: "Sin conexión: no se pudo enviar el correo" };
  }
  try {
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

/** Toast para el caso offline (C22b). */
export function notifyEmailQueuedOffline(): void {
  toast.message("Sin conexión: el correo se enviará automáticamente al reconectar");
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
 * Snackbar post-encolado (Liquid Glass): "Enviando…" / programado con Deshacer.
 * `onUndone` permite al composer restaurar el borrador.
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
    showUndo({
      message: `Envío programado para ${when}`,
      actionLabel: "Cancelar",
      durationMs: 10_000,
      onUndo: () => void undo(),
    });
    return;
  }

  showUndo({
    message: "Enviando…",
    durationMs: Math.max(data.undoWindowMs, 1_000),
    onUndo: () => void undo(),
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
