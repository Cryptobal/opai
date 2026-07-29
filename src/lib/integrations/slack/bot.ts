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

const MAX_DOC_BYTES = 10_000_000;
const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/;
const DOC_MIME_RE =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|text\/csv)$/;

/** Adjuntos procesables: imágenes + documentos (PDF/Excel/Word/CSV), hasta N. */
function pickProcessableFiles(files: SlackFile[] | undefined, max = 4): SlackFile[] {
  if (!files?.length) return [];
  return files
    .filter(
      (f) =>
        (IMAGE_MIME_RE.test(f.mimetype ?? "") || DOC_MIME_RE.test(f.mimetype ?? "")) &&
        (f.size ?? 0) <= MAX_DOC_BYTES &&
        f.url_private,
    )
    .slice(0, max);
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
  const processableFiles = event.subtype === "file_share" ? pickProcessableFiles(files) : [];

  // Adjunto no procesable (ni audio, ni imagen, ni PDF/Excel/Word) y sin texto: aviso.
  if (fileCount > 0 && !userMessage && !audioFile && processableFiles.length === 0) {
    await slackPostMessage(token, {
      channel: channelId,
      text: "Recibí tu archivo 📎, pero solo puedo procesar imágenes (PNG/JPG), PDF, Excel, Word o notas de voz (máx. 10MB). Convierte el archivo o escríbeme la instrucción en texto.",
      thread_ts: threadTs,
    }).catch((err) => console.error("[slack] adjunto no soportado sin texto:", err));
    return;
  }
  // Adjunto procesable sin instrucción: pregunta qué hacer (un archivo solo es ambiguo).
  if (processableFiles.length > 0 && !userMessage && !audioFile) {
    await slackPostMessage(token, {
      channel: channelId,
      text: "Recibí tu archivo 📎. ¿Qué hago con él? Ej: 'adjúntalo al negocio Licitación P&G y crea el checklist de documentos que piden las bases'.",
      thread_ts: threadTs,
    }).catch(() => {});
    return;
  }
  if (!userMessage && !audioFile && processableFiles.length === 0) return;

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
      const { buffer, contentType } = await slackDownloadFile(audioFile.url_private, token);
      const transcript = await transcribeAudio(
        workspace.tenantId,
        buffer,
        contentType,
        aiConfig,
      );
      if (transcript === null) {
        const msg =
          "No pude transcribir tu nota de voz; escríbeme el texto 🙏";
        await slackUpdateMessage(token, {
          channel: channelId,
          ts: placeholderTs,
          text: msg,
          blocks: [assistantSection(msg)],
        });
        return;
      }
      userMessage =
        (userMessage ? `${userMessage}\n\n` : "") +
        `[Nota de voz transcrita]: ${transcript.text}`;
      logAiUsage({
        tenantId: workspace.tenantId,
        userId: linked.adminId,
        providerType: transcript.providerType,
        model: transcript.model,
        feature: "voice_transcription",
        durationMs: Date.now() - tTranscribe,
        metadata: {
          mimeType: contentType,
          bytes: buffer.length,
          keySource: transcript.keySource,
          chatProvider: aiConfig?.providerType ?? null,
        },
      });
      await slackUpdateMessage(token, {
        channel: channelId,
        ts: placeholderTs,
        text: "⏳ Consultando OPAI…",
        blocks: [assistantSection("⏳ Consultando OPAI…")],
      }).catch(() => {});
    } catch (err) {
      console.error("[slack] error transcribiendo nota de voz:", err instanceof Error ? err.message : "unknown");
      await slackUpdateMessage(token, {
        channel: channelId,
        ts: placeholderTs,
        text: "No pude transcribir tu nota de voz 😔 Intenta escribirme el mensaje o graba de nuevo.",
        blocks: [assistantSection("No pude transcribir tu nota de voz 😔 Intenta escribirme el mensaje o graba de nuevo.")],
      }).catch(() => {});
      return;
    }
  }

  // Solo advertimos por archivos que NO pudimos procesar (ni audio ni procesables:
  // imágenes/PDF/Excel/Word/CSV). Los procesables se manejan aparte más abajo.
  const unprocessableCount = fileCount - (audioFile ? 1 : 0) - processableFiles.length;
  if (unprocessableCount > 0) {
    userMessage += `\n\n[El usuario adjuntó ${unprocessableCount} archivo(s) que no puedo leer; no están disponibles en este turno.]`;
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

    // Adjuntos: descarga, staging en R2 y preparación de contexto para el runner.
    let attachments: Array<{ mimeType: string; dataBase64: string; name?: string }> | undefined;
    let attachmentsHint: string | undefined;
    if (processableFiles.length > 0) {
      const { prepareSlackAttachments } = await import("./bot-attachments");
      const prepared = await prepareSlackAttachments(processableFiles, token, workspace.tenantId);
      attachments = prepared.multimodal.length > 0 ? prepared.multimodal : undefined;
      attachmentsHint = prepared.contextHint;
      if (prepared.extractedContext) {
        userMessage = `${userMessage}\n\n${prepared.extractedContext}`;
      }
    }

    const result = await runHelpChatTurn({
      tenantId: workspace.tenantId,
      userId: linked.adminId,
      perms: linked.perms,
      canViewAllRendiciones: hasCapability(linked.perms, "rendicion_view_all"),
      history: prior,
      userMessage,
      allowWrites: cfg.allowWrites,
      contextHint: [contextHint, attachmentsHint].filter(Boolean).join("\n") || undefined,
      attachments,
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
