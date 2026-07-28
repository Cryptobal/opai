import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { extractGmailAttachments, type GmailMessagePart } from "@/lib/gmail-message-content";
import { gmailClientForAccount } from "./gmail-account-client";
import { hydrateMissingThreadMessages } from "./correos-detail-hydrate";
import { captureEmailError } from "./email-observability";
import { attachSavedFileIds } from "./attachment-saved";
import type { CorreoDetail, CorreoAttachmentDTO } from "./correos.types";
import { parseThreadSummaryCache } from "./email-summary.service";
import {
  effectiveVertical,
  visibleVertical,
  type RadarCapability,
} from "./radar-types";

/** TTL del caché de detalle; la invalidación real es updatedAt del sync. */
const DETAIL_CACHE_TTL_MS = 15 * 60_000;
/** Tolerancia entre detailCachedAt y el @updatedAt que setea el mismo write. */
const CACHE_WRITE_SKEW_MS = 3_000;

/** true si el detalle puede servirse 100% del espejo local (C18). */
export function isDetailCacheFresh(
  thread: {
    attachmentsMeta: unknown;
    detailCachedAt: Date | null;
    updatedAt: Date;
  },
  now = new Date(),
): boolean {
  if (!thread.detailCachedAt || thread.attachmentsMeta == null) return false;
  const cachedAt = thread.detailCachedAt.getTime();
  if (now.getTime() - cachedAt > DETAIL_CACHE_TTL_MS) return false;
  // El sync (o una acción) tocó el hilo después del cacheo → invalida.
  return thread.updatedAt.getTime() - cachedAt <= CACHE_WRITE_SKEW_MS;
}

/**
 * Detalle de un hilo: cadena completa de mensajes + adjuntos.
 *
 * C18 (PR-13): antes cada apertura llamaba `threads.get format:full` en vivo.
 * Ahora el detalle se sirve desde la BD espejo cuando el caché está fresco
 * (attachments_meta persistida + detail_cached_at ≥ updatedAt, TTL 15 min);
 * cualquier escritura del sync sobre el hilo bumpea updatedAt e invalida, y
 * la señal realtime `mailbox-changed` hace que el cliente re-pida. Solo en
 * MISS se llama a Gmail (adjuntos + hidratación de mensajes faltantes) y se
 * persiste el caché. Se loggea HIT/MISS con latencia para medir el p95.
 */
export async function getCorreoDetail(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
  /** Capabilities de radar del solicitante (filtra vertical visible). */
  radarCaps?: Set<RadarCapability>;
}): Promise<CorreoDetail | null> {
  const startedAt = Date.now();
  const { tenantId, emailAccountId, threadId } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      leadId: true,
      providerThreadId: true,
      isUnread: true,
      archivedAt: true,
      starredAt: true,
      spamAt: true,
      sharedWithAccount: true,
      lastMessageAt: true,
      aiCategory: true,
      aiVertical: true,
      verticalOverride: true,
      aiUrgency: true,
      aiSentiment: true,
      aiSummary: true,
      aiClassifiedAt: true,
      lastReadAt: true,
      aiThreadSummary: true,
      attachmentsMeta: true,
      detailCachedAt: true,
      updatedAt: true,
    },
  });
  if (!thread) return null;

  // Antes de confiar en el caché C18: si el hilo no tiene mensajes o todos
  // tienen cuerpo vacío, hay que ir a Gmail sí o sí (hilos fantasma / sync
  // que guardó el mensaje sin html/text). Si no, la UI muestra "Sin mensajes."
  // o "(sin contenido)" aunque el correo exista en Gmail.
  const localBodyProbe = await prisma.crmEmailMessage.findMany({
    where: { threadId: thread.id, tenantId },
    select: { htmlBody: true, textBody: true },
    take: 20,
  });
  const needsBodyRepair =
    localBodyProbe.length === 0 ||
    localBodyProbe.every((m) => !m.htmlBody?.trim() && !m.textBody?.trim());

  const cacheFresh = isDetailCacheFresh(thread) && !needsBodyRepair;
  let attachments: CorreoAttachmentDTO[] = [];
  // B3: si Gmail falla no devolvemos adjuntos vacíos en silencio — el hilo
  // sale con degraded=true y la UI muestra el aviso de reintento.
  let degraded = false;

  if (cacheFresh) {
    attachments = (thread.attachmentsMeta as CorreoAttachmentDTO[] | null) ?? [];
  } else if (thread.providerThreadId) {
    const emailAccount = await prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        email: true,
        userId: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
      },
    });
    const gmail = emailAccount
      ? gmailClientForAccount({ id: emailAccountId, ...emailAccount })
      : null;
    if (gmail && emailAccount) {
      try {
        const res = await gmail.users.threads.get({
          userId: "me",
          id: thread.providerThreadId,
          format: "full",
        });
        const gmailMessages: gmail_v1.Schema$Message[] = res.data.messages ?? [];
        for (const m of gmailMessages) {
          if (!m.id) continue;
          for (const att of extractGmailAttachments(m.payload as GmailMessagePart | undefined)) {
            attachments.push({ ...att, messageId: m.id });
          }
        }
        await hydrateMissingThreadMessages({
          tenantId,
          threadId: thread.id,
          emailAccountId,
          accountUserId: emailAccount.userId,
          ownEmail: emailAccount.email,
          messages: gmailMessages,
          gmail,
        });
        // Persistir el caché DESPUÉS de hidratar: la hidratación también
        // bumpea updatedAt y escribir al final deja detailCachedAt ≥ updatedAt.
        // No cachear si tras hidratar sigue vacío: forzará reintento al abrir.
        const afterCount = await prisma.crmEmailMessage.count({
          where: { threadId: thread.id, tenantId },
        });
        if (afterCount > 0) {
          await prisma.crmEmailThread.update({
            where: { id: thread.id },
            data: {
              attachmentsMeta: attachments as unknown as object,
              detailCachedAt: new Date(),
            },
          });
        }
      } catch (err) {
        degraded = true;
        // Caché viejo como fallback honesto (mejor que lista vacía).
        attachments = (thread.attachmentsMeta as CorreoAttachmentDTO[] | null) ?? [];
        captureEmailError(err, {
          scope: "detalle-hilo",
          tenantId,
          emailAccountId,
          threadId: thread.id,
        });
      }
    }
  }

  const [messages, account, deal] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: {
        id: true, providerMessageId: true, direction: true, fromEmail: true,
        replyToEmail: true, toEmails: true, ccEmails: true, subject: true,
        htmlBody: true, textBody: true, sentAt: true, isDraft: true,
      },
    }),
    thread.accountId
      ? prisma.crmAccount.findFirst({ where: { id: thread.accountId, tenantId }, select: { name: true } })
      : null,
    thread.dealId
      ? prisma.crmDeal.findFirst({
          where: { id: thread.dealId, tenantId },
          select: { title: true, fechaEntrega: true, isLicitacion: true },
        })
      : null,
  ]);

  // B5: chip "Guardado" — consulta fresca (fuera de attachmentsMeta) para no
  // invalidar el caché C18.
  const attachmentsWithSaved = await attachSavedFileIds(tenantId, thread.id, attachments);

  // Frescura del resumen: contra el último mensaje no borrador (un draft no
  // debe invalidar el caché).
  const lastNonDraftId =
    [...messages].reverse().find((m) => !m.isDraft)?.id ?? null;
  const cache = parseThreadSummaryCache(thread.aiThreadSummary);
  const threadSummary = cache
    ? {
        text: cache.summary,
        generatedAt: cache.generatedAt ?? null,
        stale: cache.lastMessageId !== lastNonDraftId,
      }
    : null;

  // Métrica simple para el antes/después del p95 (C18).
  console.log(
    `[correos] detail ${cacheFresh ? "cache-hit" : "cache-miss"} thread=${thread.id} ms=${Date.now() - startedAt}`,
  );

  return {
    thread: {
      id: thread.id,
      subject: thread.subject,
      accountId: thread.accountId,
      accountName: account?.name ?? null,
      dealId: thread.dealId,
      dealTitle: deal?.title ?? null,
      dealFechaEntrega: deal?.fechaEntrega
        ? deal.fechaEntrega.toISOString().slice(0, 10)
        : null,
      dealIsLicitacion: Boolean(deal?.isLicitacion),
      leadId: thread.leadId,
      providerThreadId: thread.providerThreadId,
      isUnread: thread.isUnread,
      archivedAt: thread.archivedAt?.toISOString() ?? null,
      starredAt: thread.starredAt?.toISOString() ?? null,
      spamAt: thread.spamAt?.toISOString() ?? null,
      sharedWithAccount: thread.sharedWithAccount,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
      aiCategory: thread.aiCategory,
      aiVertical: thread.aiVertical,
      vertical: visibleVertical(
        effectiveVertical(thread.aiVertical, thread.verticalOverride),
        params.radarCaps ?? new Set(),
      ),
      verticalFixed: Boolean(thread.verticalOverride),
      aiUrgency: thread.aiUrgency,
      aiSentiment: thread.aiSentiment,
      aiSummary: thread.aiSummary,
      aiClassifiedAt: thread.aiClassifiedAt?.toISOString() ?? null,
      lastReadAt: thread.lastReadAt?.toISOString() ?? null,
      threadSummary,
    },
    messages: messages.map(({ isDraft: _isDraft, ...m }) => ({
      ...m,
      sentAt: m.sentAt?.toISOString() ?? null,
    })),
    attachments: attachmentsWithSaved,
    degraded,
  };
}
