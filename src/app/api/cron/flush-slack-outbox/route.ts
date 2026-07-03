import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSlackToken } from "@/lib/integrations/slack/crypto";
import { slackPostMessage, SlackApiError, isPermanentSlackError } from "@/lib/integrations/slack/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ATTEMPTS = 5;
const BATCH = 25;

/**
 * GET /api/cron/flush-slack-outbox — reintenta envíos Slack fallidos.
 * Toma PENDING/FAILED con attempts < 5 por createdAt, lote de 25.
 * Protegido por CRON_SECRET (mismo patrón que flush-push-outbox).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Paso 0: vence las acciones pendientes (confirmaciones/aprobaciones) cuyo
  // expiresAt ya pasó. Update masivo, barato, antes de reintentar envíos.
  const expired = await prisma.slackPendingAction.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", resolvedAt: new Date() },
  });

  const due = await prisma.slackOutbox.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  // Token por workspace: se descifra una sola vez por corrida.
  const tokenCache = new Map<string, string | null>();
  async function tokenFor(workspaceId: string): Promise<string | null> {
    if (tokenCache.has(workspaceId)) return tokenCache.get(workspaceId) ?? null;
    const ws = await prisma.slackWorkspace.findUnique({ where: { id: workspaceId } });
    let token: string | null = null;
    if (ws && ws.status === "ACTIVE") {
      try {
        token = decryptSlackToken(ws.botTokenEnc);
      } catch (err) {
        console.error("[slack] no se pudo descifrar token del workspace", workspaceId, err);
      }
    }
    tokenCache.set(workspaceId, token);
    return token;
  }

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    const token = await tokenFor(item.workspaceId);
    if (!token) {
      failed++;
      await prisma.slackOutbox.update({
        where: { id: item.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: "workspace_revoked_or_missing" },
      });
      continue;
    }
    const payload = item.payload as { text?: string; blocks?: unknown[]; thread_ts?: string };
    try {
      const { ts } = await slackPostMessage(token, {
        channel: item.channelId,
        text: payload.text ?? "",
        blocks: payload.blocks,
        thread_ts: payload.thread_ts, // hilo por ticket (Fase 7) sobrevive el reintento
      });
      await prisma.slackOutbox.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date(), slackTs: ts },
      });
      sent++;
    } catch (err) {
      failed++;
      const reason = err instanceof SlackApiError ? err.slackError : String(err);
      const permanent = err instanceof SlackApiError && isPermanentSlackError(err.slackError);
      console.error(permanent ? "[slack] reintento falló (permanente, se descarta)" : "[slack] reintento falló", item.id, reason);
      await prisma.slackOutbox.update({
        where: { id: item.id },
        data: { status: "FAILED", attempts: permanent ? MAX_ATTEMPTS : { increment: 1 }, lastError: reason },
      });
    }
  }

  return NextResponse.json({ sent, failed, total: due.length, expiredPending: expired.count });
}
