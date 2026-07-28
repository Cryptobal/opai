import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { gmailClientForAccount } from "./gmail-account-client";
import { applyThreadLabelFlags } from "./gmail-thread-labels";

export type CorreoAction =
  | "archive"
  | "unarchive"
  | "trash"
  | "untrash"
  | "markRead"
  | "markUnread"
  | "snooze"
  | "unsnooze"
  | "star"
  | "unstar"
  | "spam"
  | "unspam";

/**
 * Ejecuta una acción de bandeja contra Gmail y SOLO entonces persiste local.
 * trash = Papelera (recuperable); nunca delete permanente.
 *
 * Snooze: la API pública de Gmail NO expone su snooze nativo (no hay label
 * `SNOOZED` accesible ni endpoint). Se implementa el snooze propio de OPAI
 * espejado como los clientes third-party: al posponer se saca de INBOX en
 * Gmail (`removeLabelIds:["INBOX"]`) y el hilo vuelve solo al despertar
 * (`addLabelIds:["INBOX"]`, cron). `snoozeUntil` es obligatorio para "snooze".
 */
export async function runCorreoThreadAction(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  action: CorreoAction;
  snoozeUntil?: Date;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, emailAccountId: true, providerThreadId: true },
  });
  if (!thread?.emailAccountId || !thread.providerThreadId) {
    return { ok: false, error: "Hilo no vinculado a Gmail", status: 400 };
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      id: thread.emailAccountId,
      tenantId: params.tenantId,
      userId: params.userId,
      status: "active",
    },
  });
  if (!account) return { ok: false, error: "Forbidden", status: 403 };

  const gmail = gmailClientForAccount(account);
  if (!gmail) return { ok: false, error: "Gmail no conectado", status: 400 };

  const tid = thread.providerThreadId;
  try {
    if (params.action === "trash") {
      await gmail.users.threads.trash({ userId: "me", id: tid });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { trashedAt: new Date(), archivedAt: null },
      });
      // Refrescar labelIds locales: si no, quedan con INBOX stale y el heal/
      // derive desde mensajes puede reabrir el hilo en Recibidos.
      await refreshThreadLabelsFromGmail({
        gmail,
        tenantId: params.tenantId,
        emailAccountId: account.id,
        providerThreadId: tid,
      }).catch(() => {});
      return { ok: true };
    }
    if (params.action === "untrash") {
      await gmail.users.threads.untrash({ userId: "me", id: tid });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { trashedAt: null },
      });
      // No fijar archivedAt a mano: se rederiva desde labels de Gmail.
      await refreshThreadLabelsFromGmail({
        gmail,
        tenantId: params.tenantId,
        emailAccountId: account.id,
        providerThreadId: tid,
      }).catch(() => {});
      return { ok: true };
    }
    if (params.action === "archive") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { archivedAt: new Date(), trashedAt: null },
      });
      await refreshThreadLabelsFromGmail({
        gmail,
        tenantId: params.tenantId,
        emailAccountId: account.id,
        providerThreadId: tid,
      }).catch(() => {});
      return { ok: true };
    }
    if (params.action === "unarchive") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { addLabelIds: ["INBOX"], removeLabelIds: ["TRASH"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { archivedAt: null, trashedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "snooze") {
      if (!params.snoozeUntil) return { ok: false, error: "snoozeUntil requerido", status: 400 };
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { snoozedUntil: params.snoozeUntil, archivedAt: null, trashedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "unsnooze") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { addLabelIds: ["INBOX"] },
      });
      // El sync puede haber seteado archivedAt mientras el hilo estuvo fuera de
      // INBOX (pospuesto ≠ archivado). Al despertar hay que limpiarlo o el
      // correo queda atrapado en Archivados y no vuelve a Recibidos.
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { snoozedUntil: null, archivedAt: null, trashedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "star") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { addLabelIds: ["STARRED"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { starredAt: new Date() },
      });
      return { ok: true };
    }
    if (params.action === "unstar") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["STARRED"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { starredAt: null },
      });
      return { ok: true };
    }
    if (params.action === "spam") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { spamAt: new Date(), archivedAt: null, trashedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "unspam") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["SPAM"], addLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { spamAt: null, archivedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "markRead") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        // A02: sella la última lectura (resumen "qué pasó desde entonces").
        data: { isUnread: false, lastReadAt: new Date() },
      });
      return { ok: true };
    }
    await gmail.users.threads.modify({
      userId: "me",
      id: tid,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
    await prisma.crmEmailThread.update({
      where: { id: thread.id },
      data: { isUnread: true },
    });
    return { ok: true };
  } catch (err) {
    console.error("[gmail] thread action failed:", params.action, err);
    const message = err instanceof Error ? err.message : String(err);
    // Token revocado/roto: marcar la cuenta para que la UI pida reconexión
    // (mismo criterio que el worker de sync) en vez de un 502 genérico.
    if (/invalid_grant|unauthorized_client|invalid_client/i.test(message)) {
      await prisma.crmEmailAccount
        .update({ where: { id: account.id }, data: { status: "revoked" } })
        .catch(() => {});
      return {
        ok: false,
        error: "Gmail rechazó la acción (permisos). Reconectá tu casilla desde Integraciones.",
        status: 401,
      };
    }
    const e = err as { code?: number; status?: number; response?: { status?: number } };
    const httpStatus = e?.code ?? e?.status ?? e?.response?.status;
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        ok: false,
        error: "Gmail rechazó la acción (permisos). Reconectá tu casilla desde Integraciones.",
        status: 403,
      };
    }
    return { ok: false, error: "Gmail rechazó la acción", status: 502 };
  }
}

/**
 * Persiste `labelIds` por mensaje desde `threads.get` (format minimal).
 * Mantiene fresca la fuente local usada por `deriveThreadStateFromMessages`.
 */
async function writeMessageLabels(
  tenantId: string,
  threadMessages: Array<{ id?: string | null; labelIds?: string[] | null }>,
): Promise<void> {
  for (const m of threadMessages) {
    if (!m.id) continue;
    await prisma.crmEmailMessage.updateMany({
      where: { tenantId, providerMessageId: m.id },
      data: { labelIds: m.labelIds ?? [] },
    });
  }
}

/**
 * Refresca flags locales leyendo el hilo en Gmail (unión de labels de todos
 * sus mensajes). Un 404 significa hilo eliminado permanentemente en Gmail →
 * se marca como papelera local. Además escribe labelIds por mensaje.
 */
export async function refreshThreadLabelsFromGmail(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  providerThreadId: string;
}): Promise<void> {
  try {
    const res = await params.gmail.users.threads.get({
      userId: "me",
      id: params.providerThreadId,
      format: "minimal",
    });
    const messages = res.data.messages ?? [];
    await writeMessageLabels(params.tenantId, messages);
    const all = new Set<string>();
    for (const m of messages) {
      for (const l of m.labelIds ?? []) all.add(l);
    }
    await applyThreadLabelFlags({
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      providerThreadId: params.providerThreadId,
      labelIds: Array.from(all),
    });
  } catch (err) {
    const e = err as { code?: number; status?: number; response?: { status?: number } };
    const status = e?.code ?? e?.status ?? e?.response?.status;
    if (status === 404) {
      await prisma.crmEmailThread.updateMany({
        where: {
          tenantId: params.tenantId,
          emailAccountId: params.emailAccountId,
          providerThreadId: params.providerThreadId,
          trashedAt: null,
        },
        data: { trashedAt: new Date(), archivedAt: null, spamAt: null },
      });
      return;
    }
    console.warn("[gmail] refreshThreadLabelsFromGmail:", err);
  }
}
