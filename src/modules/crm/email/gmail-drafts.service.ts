/**
 * Borradores Gmail bidireccionales (C08, D4):
 *  - `saveGmailDraft` — autosave del composer a users.drafts.create/update:
 *    cerrar el composer nunca pierde trabajo y el draft aparece en Gmail.
 *  - `deleteGmailDraft` — descartar (Gmail + espejo local).
 *  - `syncGmailDrafts` — barrido entrante: drafts creados/actualizados en
 *    Gmail aparecen en OPAI; los enviados/descartados fuera desaparecen.
 *
 * El espejo local vive en CrmEmailMessage con `isDraft=true` +
 * `providerDraftId`. OJO: Gmail cambia el `message.id` del draft en cada
 * update — la identidad estable es el draft id, por eso el upsert local va
 * por (emailAccountId, providerDraftId).
 */
import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import {
  extractGmailMessageBodies,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";
import { buildGmailRawMessage } from "./gmail-mime";
import { upsertLinkedThread } from "./thread-linking";
import type { EmailAccountLite } from "./gmail-sync-state";

const DRAFT_SYNC_CAP = 50;

type DraftUpsertResult = {
  providerDraftId: string;
  providerMessageId: string | null;
  messageDbId: string;
  threadDbId: string | null;
};

/** Persiste el espejo local de un draft (upsert por draft id estable). */
async function upsertLocalDraft(params: {
  tenantId: string;
  emailAccount: EmailAccountLite;
  providerDraftId: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  createdByUserId?: string | null;
}): Promise<{ messageDbId: string; threadDbId: string | null }> {
  const subject = params.subject.trim() || "(Borrador sin asunto)";

  // Hilo: si el draft cuelga de un hilo Gmail existente, engancharlo; si es
  // composición nueva, crear/upsert el hilo del draft (aparece en Borradores).
  // isInbound:false → en hilos existentes NO bumpea lastMessageAt.
  const thread = await upsertLinkedThread({
    tenantId: params.tenantId,
    subject,
    lastMessageAt: new Date(),
    counterpartyEmails: [...params.toEmails, ...params.ccEmails].filter(
      (e) => normalizeEmailAddress(e) !== normalizeEmailAddress(params.emailAccount.email),
    ),
    emailAccountId: params.emailAccount.id,
    providerThreadId: params.providerThreadId,
    isInbound: false,
  });

  const common = {
    tenantId: params.tenantId,
    threadId: thread.id,
    providerMessageId: params.providerMessageId,
    direction: "out",
    fromEmail: normalizeEmailAddress(params.fromEmail),
    toEmails: params.toEmails,
    ccEmails: params.ccEmails,
    bccEmails: params.bccEmails,
    subject,
    htmlBody: params.htmlBody,
    textBody: params.textBody,
    sentAt: null,
    createdBy: params.createdByUserId ?? params.emailAccount.userId,
    status: "draft",
    source: "gmail",
    emailAccountId: params.emailAccount.id,
    labelIds: ["DRAFT"],
    isDraft: true,
    providerDraftId: params.providerDraftId,
  };

  const existing = await prisma.crmEmailMessage.findFirst({
    where: {
      tenantId: params.tenantId,
      emailAccountId: params.emailAccount.id,
      providerDraftId: params.providerDraftId,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.crmEmailMessage.update({ where: { id: existing.id }, data: common });
    return { messageDbId: existing.id, threadDbId: thread.id };
  }
  const created = await prisma.crmEmailMessage.create({ data: common });
  return { messageDbId: created.id, threadDbId: thread.id };
}

/**
 * Crea o actualiza un draft en Gmail y su espejo local. `threadDbId` (hilo
 * interno) hace que el draft quede agrupado como respuesta en ese hilo.
 */
export async function saveGmailDraft(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  providerDraftId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string | null;
  text: string | null;
  threadDbId: string | null;
  createdByUserId?: string | null;
}): Promise<DraftUpsertResult> {
  const { gmail } = params;

  let gmailThreadId: string | null = null;
  if (params.threadDbId) {
    const thread = await prisma.crmEmailThread.findFirst({
      where: { id: params.threadDbId, tenantId: params.tenantId },
      select: { providerThreadId: true },
    });
    gmailThreadId = thread?.providerThreadId ?? null;
  }

  const raw = buildGmailRawMessage({
    from: params.emailAccount.email,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    // Gmail exige To para enviar, no para guardar drafts; el subject vacío es válido.
    subject: params.subject,
    html: params.html || undefined,
    text: params.html ? undefined : params.text ?? undefined,
  });
  const message = {
    raw,
    ...(gmailThreadId ? { threadId: gmailThreadId } : {}),
  };

  let draft: gmail_v1.Schema$Draft;
  if (params.providerDraftId) {
    try {
      const res = await gmail.users.drafts.update({
        userId: "me",
        id: params.providerDraftId,
        requestBody: { message },
      });
      draft = res.data;
    } catch (error) {
      const status = (error as { code?: number; status?: number })?.code ??
        (error as { status?: number })?.status;
      // Draft borrado/enviado desde Gmail mientras editábamos: crear uno nuevo.
      if (status === 404) {
        const res = await gmail.users.drafts.create({
          userId: "me",
          requestBody: { message },
        });
        draft = res.data;
      } else {
        throw error;
      }
    }
  } else {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message },
    });
    draft = res.data;
  }

  const providerDraftId = draft.id!;
  const providerMessageId = draft.message?.id ?? null;
  const providerThreadId = draft.message?.threadId ?? gmailThreadId;

  const local = await upsertLocalDraft({
    tenantId: params.tenantId,
    emailAccount: params.emailAccount,
    providerDraftId,
    providerMessageId,
    providerThreadId,
    fromEmail: params.emailAccount.email,
    toEmails: params.to,
    ccEmails: params.cc,
    bccEmails: params.bcc,
    subject: params.subject,
    htmlBody: params.html,
    textBody: params.text,
    createdByUserId: params.createdByUserId,
  });

  return {
    providerDraftId,
    providerMessageId,
    messageDbId: local.messageDbId,
    threadDbId: local.threadDbId,
  };
}

/** Descarta un draft en Gmail (best-effort si ya no existe) y borra el espejo. */
export async function deleteGmailDraft(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  providerDraftId: string;
}): Promise<void> {
  try {
    await params.gmail.users.drafts.delete({ userId: "me", id: params.providerDraftId });
  } catch (error) {
    const status = (error as { code?: number })?.code;
    if (status !== 404) throw error;
  }
  await deleteLocalDraftMirror(params);
}

/** Borra solo el espejo local (y el hilo si quedó vacío). */
async function deleteLocalDraftMirror(params: {
  tenantId: string;
  emailAccountId: string;
  providerDraftId: string;
}): Promise<void> {
  const drafts = await prisma.crmEmailMessage.findMany({
    where: {
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      providerDraftId: params.providerDraftId,
      isDraft: true,
    },
    select: { id: true, threadId: true },
  });
  if (drafts.length === 0) return;
  await prisma.crmEmailMessage.deleteMany({
    where: { id: { in: drafts.map((d) => d.id) } },
  });
  // Hilos que eran SOLO ese draft (composición nueva) quedan vacíos: fuera.
  for (const threadId of new Set(drafts.map((d) => d.threadId))) {
    const remaining = await prisma.crmEmailMessage.count({ where: { threadId } });
    if (remaining === 0) {
      await prisma.crmEmailThread.deleteMany({
        where: { id: threadId, tenantId: params.tenantId },
      });
    }
  }
}

/**
 * Barrido entrante de drafts (mantenimiento): espeja los drafts de Gmail en
 * OPAI y elimina los espejos locales de drafts que ya no existen (enviados o
 * descartados fuera). Presupuesto acotado; best-effort.
 */
export async function syncGmailDrafts(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
}): Promise<{ synced: number; removed: number }> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  let synced = 0;
  try {
    const list = await gmail.users.drafts.list({
      userId: "me",
      maxResults: DRAFT_SYNC_CAP,
    });
    const remote = list.data.drafts ?? [];
    const remoteIds = new Set(
      remote.map((d) => d.id).filter((x): x is string => Boolean(x)),
    );

    const local = await prisma.crmEmailMessage.findMany({
      where: {
        tenantId,
        emailAccountId: emailAccount.id,
        isDraft: true,
        providerDraftId: { not: null },
      },
      select: { providerDraftId: true, providerMessageId: true },
    });
    const localByDraftId = new Map(local.map((m) => [m.providerDraftId!, m]));

    for (const draft of remote) {
      if (!draft.id || Date.now() >= deadline) break;
      const known = localByDraftId.get(draft.id);
      // El message.id del draft cambia en cada edición: si coincide, no cambió.
      if (known && known.providerMessageId === (draft.message?.id ?? null)) continue;
      try {
        const full = await gmail.users.drafts.get({
          userId: "me",
          id: draft.id,
          format: "full",
        });
        const message = full.data.message;
        if (!message) continue;
        const headers = message.payload?.headers ?? [];
        const header = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
        const { htmlBody, textBody } = extractGmailMessageBodies(
          message.payload as GmailMessagePart | undefined,
        );
        await upsertLocalDraft({
          tenantId,
          emailAccount,
          providerDraftId: draft.id,
          providerMessageId: message.id ?? null,
          providerThreadId: message.threadId ?? null,
          fromEmail: header("From") || emailAccount.email,
          toEmails: extractEmailAddresses(header("To")),
          ccEmails: extractEmailAddresses(header("Cc")),
          bccEmails: extractEmailAddresses(header("Bcc")),
          subject: header("Subject"),
          htmlBody,
          textBody: textBody || message.snippet || null,
        });
        synced += 1;
      } catch (err) {
        console.warn("[gmail] syncGmailDrafts item:", draft.id, err);
      }
    }

    // Solo confiable si la lista remota está completa (sin nextPageToken).
    let removed = 0;
    if (!list.data.nextPageToken) {
      for (const [draftId] of localByDraftId) {
        if (remoteIds.has(draftId)) continue;
        await deleteLocalDraftMirror({
          tenantId,
          emailAccountId: emailAccount.id,
          providerDraftId: draftId,
        });
        removed += 1;
      }
    }
    return { synced, removed };
  } catch (err) {
    console.warn("[gmail] syncGmailDrafts:", err);
    return { synced, removed: 0 };
  }
}
