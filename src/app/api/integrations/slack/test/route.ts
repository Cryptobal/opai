import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { buildNotificationBlocks } from "@/lib/integrations/slack/blocks";
import { slackPostMessage, SlackApiError } from "@/lib/integrations/slack/api";

export const dynamic = "force-dynamic";

const schema = z.object({ channelId: z.string().min(1) });

/**
 * POST { channelId } → envía una tarjeta de prueba vía outbox y devuelve el
 * resultado real. Un error de Slack (ej. not_in_channel) se devuelve legible.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId } = auth.ctx;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) {
    return NextResponse.json({ success: false, error: "Slack no está conectado" }, { status: 400 });
  }

  const { text, blocks } = buildNotificationBlocks({
    title: "✅ OPAI conectado correctamente",
    body: "Esta es una tarjeta de prueba. Si la ves, el ruteo de notificaciones a este canal funciona.",
    category: "Integraciones",
  });

  const row = await prisma.slackOutbox.create({
    data: {
      tenantId,
      workspaceId: ws.id,
      channelId: parsed.data.channelId,
      payload: { text, blocks } as object,
      status: "PENDING",
    },
    select: { id: true },
  });

  try {
    const { ts } = await slackPostMessage(ws.botToken, {
      channel: parsed.data.channelId,
      text,
      blocks,
    });
    await prisma.slackOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), slackTs: ts },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : "unknown_error";
    await prisma.slackOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts: 1, lastError: reason },
    });
    // Error a nivel Slack (no de OPAI): 200 con el detalle legible para la UI.
    return NextResponse.json({ success: false, error: reason });
  }
}
