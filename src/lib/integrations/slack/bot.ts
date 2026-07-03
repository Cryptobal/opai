/**
 * Bot conversacional OPAI Intelligence en Slack (menciones + DMs).
 *
 * Corre dentro de `after()` (el ACK 200 ya se envió en <3s). Ejecuta el MISMO
 * motor de tools del chat web vía `runHelpChatTurn`, con la identidad y permisos
 * del Admin vinculado. Memoria conversacional por thread en `SlackBotThread`.
 */

import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/permissions";
import { getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { runHelpChatTurn } from "@/lib/ai/help-chat-runner";
import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "./user-link";
import { slackPostMessage, slackUpdateMessage, assistantSetStatus, assistantSetTitle } from "./api";
import { toSlackMarkdown } from "./markdown";
import { assistantSection, contextLine, confirmActionsBlock } from "./blocks";

/** Archivo adjunto en un evento de Slack (subset de la File object). */
export interface SlackFile {
  id?: string;
  name?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
  permalink?: string;
}

export interface SlackBotEvent {
  type?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  channel_type?: string;
  bot_id?: string;
  subtype?: string;
  files?: SlackFile[];
}

type Turn = { role: string; content: string };

const PENDING_TTL_MS = 15 * 60 * 1000;
const MAX_TURNS = 24; // ~12 turnos user/assistant
const MAX_TRANSCRIPT_CHARS = 24_000;

function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Hint situado: si el usuario mira un canal puenteado en el panel de IA, lo indica al runner. */
async function buildContextHint(ws: ActiveWorkspace, slackUserId: string): Promise<string | undefined> {
  const link = await prisma.slackUserLink.findUnique({
    where: { workspaceId_slackUserId: { workspaceId: ws.id, slackUserId } },
    select: { activeChannelId: true },
  });
  if (!link?.activeChannelId) return undefined;
  const bridged = await prisma.slackChannelLink.findFirst({
    where: { tenantId: ws.tenantId, slackChannelId: link.activeChannelId },
    select: { id: true },
  });
  if (!bridged) return undefined;
  return `Contexto: el usuario está viendo el canal Slack <#${link.activeChannelId}>, puenteado con un chat de OPAI. Si su pregunta es ambigua, considera ese canal como foco probable.`;
}

function capTranscript(msgs: Turn[]): Turn[] {
  let t = msgs.slice(-MAX_TURNS);
  let size = t.reduce((s, m) => s + m.content.length, 0);
  while (size > MAX_TRANSCRIPT_CHARS && t.length > 2) {
    t = t.slice(2);
    size = t.reduce((s, m) => s + m.content.length, 0);
  }
  return t;
}

async function loadTranscript(workspaceId: string, channelId: string, threadTs: string): Promise<Turn[]> {
  const row = await prisma.slackBotThread.findUnique({
    where: { workspaceId_channelId_threadTs: { workspaceId, channelId, threadTs } },
    select: { transcript: true },
  });
  return Array.isArray(row?.transcript) ? (row!.transcript as Turn[]) : [];
}

async function saveTranscript(
  ws: ActiveWorkspace,
  channelId: string,
  threadTs: string,
  prior: Turn[],
  userMessage: string,
  assistantText: string,
): Promise<void> {
  const next = capTranscript([...prior, { role: "user", content: userMessage }, { role: "assistant", content: assistantText }]);
  await prisma.slackBotThread.upsert({
    where: { workspaceId_channelId_threadTs: { workspaceId: ws.id, channelId, threadTs } },
    create: { tenantId: ws.tenantId, workspaceId: ws.id, channelId, threadTs, transcript: next as object, lastMessageAt: new Date() },
    update: { transcript: next as object, lastMessageAt: new Date() },
  });
}

/** Procesa un evento app_mention/message. Idempotente ante ruido (bots, edits). */
export async function handleBotEvent(teamId: string, event: SlackBotEvent): Promise<void> {
  if (event.bot_id || event.subtype) return; // mensajes de bots, ediciones, joins…
  if (event.type === "message" && event.channel_type !== "im") return; // 'message' solo para DMs
  const slackUserId = event.user;
  const channelId = event.channel;
  if (!slackUserId || !channelId || !event.ts) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  if (slackUserId === workspace.botUserId) return; // nunca responderse a sí mismo

  const threadTs = event.thread_ts || event.ts;
  const userMessage = stripMention(event.text || "");
  if (!userMessage) return;
  const token = workspace.botToken;

  // Gate de vínculo: usuario no vinculado = cero datos, solo el flujo de vínculo.
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    const prompt = buildLinkPrompt(workspace, slackUserId);
    await slackPostMessage(token, { channel: channelId, text: prompt.text, blocks: prompt.blocks, thread_ts: threadTs });
    return;
  }

  // Panel de IA (agente nativo): indicador nativo "pensando…" + título del hilo.
  // Best-effort: en un DM normal (no-agente) estas llamadas fallan y se ignoran.
  void assistantSetStatus(token, channelId, threadTs, "Pensando…").catch(() => {});
  void assistantSetTitle(token, channelId, threadTs, userMessage.slice(0, 40)).catch(() => {});

  let placeholderTs: string;
  try {
    const posted = await slackPostMessage(token, { channel: channelId, text: "⏳ Consultando OPAI…", thread_ts: threadTs });
    placeholderTs = posted.ts;
  } catch (err) {
    console.error("[slack] no se pudo publicar placeholder:", err);
    return;
  }

  try {
    const cfg = await getAiHelpChatConfig(workspace.tenantId);
    const prior = await loadTranscript(workspace.id, channelId, threadTs);
    const result = await runHelpChatTurn({
      tenantId: workspace.tenantId,
      userId: linked.adminId,
      perms: linked.perms,
      canViewAllRendiciones: hasCapability(linked.perms, "rendicion_view_all"),
      history: prior,
      userMessage,
      allowWrites: cfg.allowWrites,
      contextHint: await buildContextHint(workspace, slackUserId),
    });

    const blocks: unknown[] = [assistantSection(toSlackMarkdown(result.text))];
    // Tarjetas compactas de las entidades que tocaron las tools (≤3): el botón
    // Abrir lleva a la URL profunda REAL devuelta por la tool (no una inventada).
    if (result.entities?.length) {
      blocks.push({ type: "divider" });
      for (const e of result.entities) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*${e.title}*${e.subtitle ? `\n${e.subtitle}` : ""}` },
          accessory: { type: "button", text: { type: "plain_text", text: "Abrir", emoji: true }, url: e.url },
        });
      }
    }
    if (result.pendingConfirmation) {
      const pa = await prisma.slackPendingAction.create({
        data: {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          kind: "TOOL_CONFIRM",
          toolName: result.pendingConfirmation.confirmToolName,
          toolArgs: result.pendingConfirmation.args as object,
          requestedBySlackUserId: slackUserId,
          channelId,
          messageTs: placeholderTs,
          status: "PENDING",
          expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        },
        select: { id: true },
      });
      blocks.push(contextLine(`⚠️ Acción: *${result.pendingConfirmation.summary}* · confirma o cancela (vence en 15 min)`));
      blocks.push(confirmActionsBlock(pa.id));
    }

    await slackUpdateMessage(token, {
      channel: channelId,
      ts: placeholderTs,
      text: result.text.slice(0, 2900),
      blocks,
    });

    await saveTranscript(workspace, channelId, threadTs, prior, userMessage, result.text);
  } catch (err) {
    console.error("[slack] error procesando turno del bot:", err);
    await slackUpdateMessage(token, {
      channel: channelId,
      ts: placeholderTs,
      text: "⚠️ No pude completar la consulta. Intenta de nuevo en un momento.",
      blocks: [assistantSection("⚠️ No pude completar la consulta. Intenta de nuevo en un momento.")],
    }).catch(() => {});
  }
}
