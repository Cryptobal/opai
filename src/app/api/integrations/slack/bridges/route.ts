/**
 * Puentes de canales Slack ↔ chat OPAI (Fase 4). requireSlackAdmin.
 * GET (listar), POST (crear con validación + aviso de transparencia en ambos
 * lados), DELETE (desconectar + aviso). Cascade limpia los message maps.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { slackChannelInfo, slackPostMessage, SlackApiError } from "@/lib/integrations/slack/api";
import { sendSystemChatMessage } from "@/lib/chat-system-message";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId } = auth.ctx;

  const links = await prisma.slackChannelLink.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  const chatIds = links.map((l) => l.chatChannelId);
  const adminIds = [...new Set(links.map((l) => l.createdBy))];
  const [chatChannels, admins] = await Promise.all([
    chatIds.length
      ? prisma.chatChannel.findMany({
          where: { id: { in: chatIds } },
          select: {
            id: true,
            name: true,
            channelType: true,
            installation: { select: { name: true } },
          },
        })
      : [],
    adminIds.length ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } }) : [],
  ]);
  // Misma convención visible que el sidebar del chat: canales de instalación
  // se muestran por el nombre de la instalación, no por el name interno.
  const chatName = new Map(
    chatChannels.map((c) => [
      c.id,
      c.channelType === "INSTALLATION" && c.installation ? c.installation.name : c.name,
    ]),
  );
  const adminName = new Map(admins.map((a) => [a.id, a.name]));

  const bridges = links.map((l) => ({
    id: l.id,
    slackChannelId: l.slackChannelId,
    slackChannelName: l.slackChannelName,
    chatChannelId: l.chatChannelId,
    chatChannelName: chatName.get(l.chatChannelId) ?? "(canal eliminado)",
    enabled: l.enabled,
    createdByName: adminName.get(l.createdBy) ?? "—",
    createdAt: l.createdAt.toISOString(),
  }));
  return NextResponse.json({ success: true, bridges });
}

const createSchema = z.object({
  chatChannelId: z.string().uuid(),
  slackChannelId: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
  }

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return NextResponse.json({ success: false, error: "Conecta Slack primero" }, { status: 400 });

  const chat = await prisma.chatChannel.findFirst({
    where: { id: input.chatChannelId, tenantId },
    select: { id: true, name: true },
  });
  if (!chat) return NextResponse.json({ success: false, error: "Canal de OPAI no encontrado" }, { status: 404 });

  const existing = await prisma.slackChannelLink.findFirst({
    where: { tenantId, OR: [{ chatChannelId: input.chatChannelId }, { slackChannelId: input.slackChannelId }] },
    select: { chatChannelId: true },
  });
  if (existing) {
    const msg = existing.chatChannelId === input.chatChannelId
      ? "El canal de OPAI ya está puenteado."
      : "El canal de Slack ya está puenteado.";
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }

  let info;
  try {
    info = await slackChannelInfo(ws.botToken, input.slackChannelId);
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : "unknown_error";
    return NextResponse.json({ success: false, error: reason }, { status: 502 });
  }
  if (!info) return NextResponse.json({ success: false, error: "Canal de Slack no encontrado" }, { status: 404 });
  if (!info.isMember) {
    return NextResponse.json(
      { success: false, error: "El bot no está en ese canal de Slack. Escribe /invite @OPAI en el canal y reintenta." },
      { status: 400 },
    );
  }

  const link = await prisma.slackChannelLink.create({
    data: {
      tenantId,
      workspaceId: ws.id,
      slackChannelId: input.slackChannelId,
      slackChannelName: info.name,
      chatChannelId: input.chatChannelId,
      createdBy: userId,
    },
    select: { id: true },
  });

  // Transparencia obligatoria: aviso en ambos lados (best-effort).
  try {
    await sendSystemChatMessage({
      tenantId,
      channelId: input.chatChannelId,
      content: `🔗 Este canal quedó conectado con #${info.name} de Slack. Los mensajes se espejan en ambas plataformas.`,
      systemEventType: "slack_bridge_connected",
      systemEventData: { slackChannelId: input.slackChannelId, slackChannelName: info.name },
    });
  } catch (err) {
    console.error("[slack] aviso OPAI puente:", err);
  }
  try {
    await slackPostMessage(ws.botToken, {
      channel: input.slackChannelId,
      text: `🔗 Este canal quedó conectado con el canal «${chat.name}» de OPAI. Los mensajes se espejan en ambas plataformas.`,
    });
  } catch (err) {
    console.error("[slack] aviso Slack puente:", err);
  }

  await logAudit({
    action: "CREATE",
    entity: "SlackChannelLink",
    entityId: link.id,
    tenantId,
    userId,
    details: { source: "slack_bridge", slackChannelId: input.slackChannelId, chatChannelId: input.chatChannelId },
    request: req,
  });

  return NextResponse.json({ success: true, id: link.id });
}

export async function DELETE(req: Request) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });

  const link = await prisma.slackChannelLink.findFirst({
    where: { id, tenantId },
    select: { id: true, slackChannelId: true, slackChannelName: true, chatChannelId: true },
  });
  if (!link) return NextResponse.json({ success: false, error: "Puente no encontrado" }, { status: 404 });

  const [chat, ws] = await Promise.all([
    prisma.chatChannel.findFirst({ where: { id: link.chatChannelId, tenantId }, select: { name: true } }),
    getWorkspaceForTenant(tenantId),
  ]);

  await prisma.slackChannelLink.delete({ where: { id: link.id } }); // Cascade limpia los maps

  try {
    await sendSystemChatMessage({
      tenantId,
      channelId: link.chatChannelId,
      content: `🔗 Este canal se desconectó de #${link.slackChannelName} de Slack. Los mensajes ya no se espejan.`,
      systemEventType: "slack_bridge_disconnected",
    });
  } catch (err) {
    console.error("[slack] aviso OPAI desconexión:", err);
  }
  if (ws) {
    try {
      await slackPostMessage(ws.botToken, {
        channel: link.slackChannelId,
        text: `🔗 Este canal se desconectó del canal «${chat?.name ?? "OPAI"}» de OPAI. Los mensajes ya no se espejan.`,
      });
    } catch (err) {
      console.error("[slack] aviso Slack desconexión:", err);
    }
  }

  await logAudit({
    action: "DELETE",
    entity: "SlackChannelLink",
    entityId: link.id,
    tenantId,
    userId,
    details: { source: "slack_bridge", reason: "disconnected_by_admin" },
    request: req,
  });

  return NextResponse.json({ success: true });
}
