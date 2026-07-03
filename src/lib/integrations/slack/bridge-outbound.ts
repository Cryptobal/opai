/**
 * Puente saliente: mensajes del chat de OPAI → canal de Slack (Fase 4).
 *
 * Cada persona de OPAI aparece en Slack como ella misma (username + icon_url
 * por mensaje, scope chat:write.customize). Los canales SIN puente cuestan
 * ~cero gracias al caché module-level chatChannelId → link|null (TTL 60s).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { slackPostMessage, SlackApiError } from "./api";

export interface OutboundMessage {
  id: string;
  tenantId: string;
  channelId: string; // chat channel (uuid)
  senderType: string; // ADMIN | GUARD | CLIENT | SYSTEM | SLACK
  senderName: string;
  senderAvatar: string | null;
  content: string;
  attachments?: unknown;
  threadRootId: string | null;
}

type LinkRow = { id: string; slackChannelId: string; workspaceId: string };

const LINK_TTL_MS = 60 * 1000;
const linkCache = new Map<string, { value: LinkRow | null; expiresAt: number }>();

async function resolveLink(tenantId: string, chatChannelId: string): Promise<LinkRow | null> {
  const cached = linkCache.get(chatChannelId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const link = await prisma.slackChannelLink.findFirst({
    where: { tenantId, chatChannelId, enabled: true },
    select: { id: true, slackChannelId: true, workspaceId: true },
  });
  linkCache.set(chatChannelId, { value: link, expiresAt: Date.now() + LINK_TTL_MS });
  return link;
}

/** username en Slack: admins tal cual; el resto con sufijo de rol. */
function usernameFor(senderType: string, senderName: string): string {
  if (senderType === "GUARD") return `${senderName} · Guardia`;
  if (senderType === "CLIENT") return `${senderName} · Cliente`;
  return senderName;
}

function isHttpUrl(v: string | null): v is string {
  return !!v && /^https?:\/\//.test(v);
}

/** Convierte menciones <@adminId> a @Nombre; <@todos> → @todos. */
async function renderMentions(tenantId: string, content: string): Promise<string> {
  const ids = new Set<string>();
  const re = /<@([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) if (m[1] !== "todos") ids.add(m[1]);
  let names = new Map<string, string>();
  if (ids.size > 0) {
    const admins = await prisma.admin.findMany({
      where: { tenantId, id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    names = new Map(admins.map((a) => [a.id, a.name]));
  }
  return content.replace(re, (_full, token: string) =>
    token === "todos" ? "@todos" : names.has(token) ? `@${names.get(token)}` : `@${token}`,
  );
}

function attachmentLines(attachments: unknown): string {
  if (!Array.isArray(attachments)) return "";
  const lines: string[] = [];
  for (const a of attachments) {
    if (!a || typeof a !== "object") continue;
    const url = (a as { url?: string }).url;
    if (!isHttpUrl(url ?? null)) continue;
    const name = (a as { name?: string; fileName?: string }).name || (a as { fileName?: string }).fileName || "archivo";
    lines.push(`📎 <${url}|${name}>`);
  }
  return lines.length ? "\n" + lines.join("\n") : "";
}

export async function mirrorChatMessageToSlack(message: OutboundMessage): Promise<void> {
  // Anti-loop: nunca re-espejar lo que vino de Slack ni los mensajes de sistema.
  if (message.senderType === "SLACK" || message.senderType === "SYSTEM") return;

  const link = await resolveLink(message.tenantId, message.channelId);
  if (!link) return;

  const ws = await getWorkspaceForTenant(message.tenantId);
  if (!ws) return;

  // thread_ts: si es respuesta en hilo, busca el ts del root en Slack.
  let thread_ts: string | undefined;
  if (message.threadRootId) {
    const rootMap = await prisma.slackBridgeMessageMap.findUnique({
      where: { chatMessageId: message.threadRootId },
      select: { slackTs: true },
    });
    thread_ts = rootMap?.slackTs; // sin map → mensaje suelto (documentado)
  }

  const body = (await renderMentions(message.tenantId, message.content || "")) + attachmentLines(message.attachments);
  const username = usernameFor(message.senderType, message.senderName);
  const icon_url = isHttpUrl(message.senderAvatar) ? message.senderAvatar : undefined;

  let ts = "";
  try {
    ({ ts } = await slackPostMessage(ws.botToken, {
      channel: link.slackChannelId,
      text: body || "(mensaje sin texto)",
      thread_ts,
      username,
      icon_url,
    }));
  } catch (err) {
    if (err instanceof SlackApiError && err.slackError === "missing_scope") {
      console.error("[slack] falta chat:write.customize: reconectar workspace");
      // Reintento sin identidad por mensaje: no perder el mensaje.
      ({ ts } = await slackPostMessage(ws.botToken, {
        channel: link.slackChannelId,
        text: `*${username}:* ${body || "(mensaje sin texto)"}`,
        thread_ts,
      }));
    } else {
      throw err;
    }
  }

  if (!ts) return;
  await prisma.slackBridgeMessageMap.create({
    data: {
      tenantId: message.tenantId,
      linkId: link.id,
      chatMessageId: message.id,
      slackChannelId: link.slackChannelId,
      slackTs: ts,
      direction: "OUT",
    },
  });
}
