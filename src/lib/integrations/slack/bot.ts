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
import { getHelpChatAIConfig, transcribeAudio } from "@/lib/ai/help-chat-provider";
import { logAiUsage } from "@/lib/platform-ai-service";
import { runHelpChatTurn } from "@/lib/ai/help-chat-runner";
import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "./user-link";
import { slackPostMessage, slackUpdateMessage, assistantSetStatus, assistantSetTitle } from "./api";
import { slackDownloadFile } from "./files";
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
const MAX_AUDIO_BYTES = 8_000_000;

function pickAudioFile(files: SlackFile[] | undefined): SlackFile | null {
  if (!files?.length) return null;
  for (const f of files) {
    const mime = f.mimetype ?? "";
    if (mime.startsWith("audio/") && (f.size ?? 0) <= MAX_AUDIO_BYTES && f.url_private) {
      return f;
    }
  }
  return null;
}

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
  if (event.bot_id) return;
  if (event.subtype && event.subtype !== "file_share") return; // ediciones, joins, etc.
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
  let userMessage = stripMention(event.text || "");
  const token = workspace.botToken;

  const files = event.files ?? [];
  const fileCount = event.subtype === "file_share" ? files.length : 0;
  const audioFile = event.subtype === "file_share" ? pickAudioFile(files) : null;

  // DM con adjunto no-audio sin texto: aviso explícito (nunca silencio).
  if (fileCount > 0 && !userMessage && !audioFile) {
    await slackPostMessage(token, {
      channel: channelId,
      text: "Recibí tu archivo 📎. Por ahora no puedo leer adjuntos en Slack; escríbeme la instrucción en texto y te ayudo al tiro.",
      thread_ts: threadTs,
    }).catch((err) => console.error("[slack] no se pudo responder a file_share sin texto:", err));
    return;
  }
  if (!userMessage && !audioFile) return;

  // Gate de vínculo: usuario no vinculado = cero datos, solo el flujo de vínculo.
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    const prompt = buildLinkPrompt(workspace, slackUserId);
    await slackPostMessage(token, { channel: channelId, text: prompt.text, blocks: prompt.blocks, thread_ts: threadTs });
    return;
  }

  // Panel de IA (agente nativo): indicador nativo "pensando…" + título del hilo.
  void assistantSetStatus(token, channelId, threadTs, audioFile ? "Transcribiendo…" : "Pensando…").catch(() => {});
  void assistantSetTitle(token, channelId, threadTs, (userMessage || "Nota de voz").slice(0, 40)).catch(() => {});

  let placeholderTs: string;
  try {
    const posted = await slackPostMessage(token, {
      channel: channelId,
      text: audioFile && !userMessage ? "🎙️ Transcribiendo tu nota de voz…" : "⏳ Consultando OPAI…",
      thread_ts: threadTs,
    });
    placeholderTs = posted.ts;
  } catch (err) {
    console.error("[slack] no se pudo publicar placeholder:", err);
    return;
  }

  if (audioFile?.url_private) {
    const tTranscribe = Date.now();
    try {
      const aiConfig = await getHelpChatAIConfig(workspace.tenantId);
      if (!aiConfig) {
        await slackUpdateMessage(token, {
          channel: channelId,
          ts: placeholderTs,
          text: "Tu proveedor de IA actual no soporta transcripción de audio; escríbeme el texto 🙏",
          blocks: [assistantSection("Tu proveedor de IA actual no soporta transcripción de audio; escríbeme el texto 🙏")],
        });
        return;
      }
      const { buffer, contentType } = await slackDownloadFile(audioFile.url_private, token);
      const transcript = await transcribeAudio(aiConfig, buffer, contentType);
      if (transcript === null) {
        await slackUpdateMessage(token, {
          channel: channelId,
          ts: placeholderTs,
          text: "Tu proveedor de IA actual no soporta transcripción de audio; escríbeme el texto 🙏",
          blocks: [assistantSection("Tu proveedor de IA actual no soporta transcripción de audio; escríbeme el texto 🙏")],
        });
        return;
      }
      userMessage = (userMessage ? `${userMessage}\n\n` : "") + `[Nota de voz transcrita]: ${transcript}`;
      logAiUsage({
        tenantId: workspace.tenantId,
        userId: linked.adminId,
        providerType: aiConfig.providerType,
        model: aiConfig.model,
        feature: "voice_transcription",
        durationMs: Date.now() - tTranscribe,
        metadata: { mimeType: contentType, bytes: buffer.length },
      });
      await slackUpdateMessage(token, {
        channel: channelId,
        ts: placeholderTs,
        text: "⏳ Consultando OPAI…",
        blocks: [assistantSection("⏳ Consultando OPAI…")],
      }).catch(() => {});
    } catch (err) {
      console.error("[slack] error transcribiendo nota de voz:", err);
      await slackUpdateMessage(token, {
        channel: channelId,
        ts: placeholderTs,
        text: "No pude transcribir tu nota de voz 😔 Intenta escribirme el mensaje o graba de nuevo.",
        blocks: [assistantSection("No pude transcribir tu nota de voz 😔 Intenta escribirme el mensaje o graba de nuevo.")],
      }).catch(() => {});
      return;
    }
  }

  const nonAudioAttachments = fileCount > 0 && (!audioFile || files.length > 1);
  if (nonAudioAttachments) {
    const n = audioFile ? fileCount - 1 : fileCount;
    if (n > 0) {
      userMessage += `\n\n[El usuario adjuntó ${n} archivo(s); no están disponibles para lectura en este turno.]`;
    }
  }

  try {
    const cfg = await getAiHelpChatConfig(workspace.tenantId);
    const prior = await loadTranscript(workspace.id, channelId, threadTs);
    // Channel Expert (Fase 16): si el canal ES una sala de negocio, el hint es
    // el DOBLE contexto (conversación de la sala + ficha del deal); si no, el
    // hint situado por defecto.
    const { buildDealRoomContextHint } = await import("./deal-rooms/channel-expert");
    const contextHint =
      (await buildDealRoomContextHint(workspace.tenantId, channelId).catch(() => null)) ??
      (await buildContextHint(workspace, slackUserId));
    const result = await runHelpChatTurn({
      tenantId: workspace.tenantId,
      userId: linked.adminId,
      perms: linked.perms,
      canViewAllRendiciones: hasCapability(linked.perms, "rendicion_view_all"),
      history: prior,
      userMessage,
      allowWrites: cfg.allowWrites,
      contextHint,
    });

    const blocks: unknown[] = [assistantSection(toSlackMarkdown(result.text))];
    // Tarjetas compactas de las entidades que tocaron las tools (≤3): el botón
    // lleva a la URL profunda REAL devuelta por la tool (no una inventada).
    if (result.entities?.length) {
      blocks.push({ type: "divider" });
      for (const e of result.entities) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*${e.title}*${e.subtitle ? `\n${e.subtitle}` : ""}` },
          accessory: { type: "button", text: { type: "plain_text", text: "Abrir en OPAI", emoji: true }, url: e.url },
        });
      }
    }
    const pendingList = result.pendingConfirmations ?? [];
    for (let i = 0; i < pendingList.length; i += 1) {
      const pc = pendingList[i];
      const pa = await prisma.slackPendingAction.create({
        data: {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          kind: "TOOL_CONFIRM",
          toolName: pc.confirmToolName,
          toolArgs: pc.args as object,
          requestedBySlackUserId: slackUserId,
          channelId,
          messageTs: placeholderTs,
          status: "PENDING",
          expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        },
        select: { id: true },
      });
      const label = pendingList.length > 1 ? `Acción ${i + 1}/${pendingList.length}` : "Acción";
      blocks.push(contextLine(`⚠️ ${label}: *${pc.summary}* · confirma o cancela (vence en 15 min)`));
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
