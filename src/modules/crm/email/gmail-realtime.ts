import { getPusherServer } from "@/lib/chat";
import { appendGmailDebugTrace } from "./gmail-debug-trace";

export const GMAIL_MAILBOX_EVENT = "mailbox-changed";

export function gmailMailboxChannel(tenantId: string, userId: string): string {
  return `private-crm-correos-${tenantId}-${userId}`;
}

/**
 * Pusher solo transporta una invalidación; el cliente vuelve a leer la API.
 * Así no se filtran asuntos, direcciones ni contenido del correo por realtime.
 */
export async function broadcastGmailMailboxChanged(params: {
  tenantId: string;
  userId: string;
  reason: string;
  syncedCount?: number;
}): Promise<void> {
  try {
    await getPusherServer().trigger(
      gmailMailboxChannel(params.tenantId, params.userId),
      GMAIL_MAILBOX_EVENT,
      {
        reason: params.reason,
        syncedCount: params.syncedCount ?? 0,
        at: new Date().toISOString(),
      },
    );
    // #region agent log
    appendGmailDebugTrace({
      hypothesisId: "C",
      location: "src/modules/crm/email/gmail-realtime.ts:trigger",
      message: "Gmail mailbox realtime broadcast accepted",
      data: {
        reason: params.reason,
        syncedCount: params.syncedCount ?? 0,
        tenantScoped: Boolean(params.tenantId),
        userScoped: Boolean(params.userId),
      },
      timestamp: Date.now(),
    });
    // #endregion
  } catch (error) {
    // Realtime es best-effort: focus/polling y el cron siguen recuperando.
    console.warn("[gmail-realtime] broadcast omitido", error);
  }
}
