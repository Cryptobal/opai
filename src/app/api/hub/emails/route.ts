/**
 * GET /api/hub/emails — correos recientes del usuario para la tarjeta del Hub.
 *
 * Lee EXCLUSIVAMENTE la base local sincronizada (sin llamadas a Gmail) y solo
 * las casillas activas del usuario de sesión. No marca mensajes como leídos.
 * Respuesta acotada (máx 5 hilos) para p95 < 200 ms.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantModule } from "@/lib/require-module";
import { getHubRecentEmails } from "@/modules/crm/email/hub-recent-emails";
import { appendGmailDebugTrace } from "@/modules/crm/email/gmail-debug-trace";
import { gmailMailboxChannel } from "@/modules/crm/email/gmail-realtime";

export async function GET() {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const data = await getHubRecentEmails({
    tenantId: session.user.tenantId,
    userId: session.user.id,
  });
  const newestAt = data.items
    .map((item) => item.lastMessageAt)
    .filter((value): value is string => Boolean(value))
    .reduce<number | null>((latest, value) => {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) && (latest == null || timestamp > latest)
        ? timestamp
        : latest;
    }, null);
  // #region agent log
  appendGmailDebugTrace({
    hypothesisId: "D",
    location: "src/app/api/hub/emails/route.ts:response",
    message: "Hub email snapshot served",
    data: {
      connected: data.connected,
      accountCount: data.accountEmails.length,
      itemCount: data.items.length,
      unreadCount: data.unreadCount,
      newestAgeMs: newestAt == null ? null : Date.now() - newestAt,
      tenantScoped: Boolean(session.user.tenantId),
      userScoped: Boolean(session.user.id),
    },
    timestamp: Date.now(),
  });
  // #endregion

  return NextResponse.json({
    ...data,
    realtimeChannel: gmailMailboxChannel(
      session.user.tenantId,
      session.user.id,
    ),
  });
}
