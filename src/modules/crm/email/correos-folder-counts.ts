import { prisma } from "@/lib/prisma";
import { notSnoozedWhere } from "./correos-list";

export type CorreoFolderCounts = {
  inbox: number;
  inboxUnread: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
  drafts: number;
  spam: number;
  /** Envíos programados pendientes en el outbox (PR-12). */
  scheduled: number;
};

/**
 * Conteos frescos por pestaña. No se cachean en memoria: en Vercel cada
 * instancia mantenía una copia distinta durante 60s y el refetch realtime
 * podía seguir mostrando números viejos.
 */
export async function countCorreoFolders(params: {
  tenantId: string;
  emailAccountId: string;
}): Promise<CorreoFolderCounts> {
  const base = { tenantId: params.tenantId, emailAccountId: params.emailAccountId };
  const now = new Date();
  // Null-safe: el patrón NOT excluía los hilos con snoozedUntil NULL (ver
  // notSnoozedWhere en correos-list.ts) y el contador de Recibidos daba 0.
  const notSnoozed = notSnoozedWhere(now);
  // Recibidos = espejo INBOX de Gmail (mismo criterio que folderWhere("inbox")).
  const inboxWhere = {
    ...base,
    trashedAt: null,
    archivedAt: null,
    spamAt: null,
    messages: { some: { labelIds: { has: "INBOX" as const } } },
    ...notSnoozed,
  };
  const [inbox, inboxUnread, archived, all, trash, snoozed, drafts, spam, scheduled] =
    await Promise.all([
      prisma.crmEmailThread.count({ where: inboxWhere }),
      prisma.crmEmailThread.count({
        where: { ...inboxWhere, isUnread: true },
      }),
      prisma.crmEmailThread.count({
        where: { ...base, trashedAt: null, spamAt: null, archivedAt: { not: null } },
      }),
      prisma.crmEmailThread.count({
        where: { ...base, trashedAt: null, spamAt: null },
      }),
      prisma.crmEmailThread.count({
        where: { ...base, trashedAt: { not: null } },
      }),
      prisma.crmEmailThread.count({
        where: { ...base, trashedAt: null, spamAt: null, snoozedUntil: { gt: now } },
      }),
      // C10: borradores y spam. Enviados no lleva contador (join caro y Gmail
      // tampoco lo muestra). La optimización de counts llega en PR-13.
      prisma.crmEmailMessage.count({
        where: {
          tenantId: params.tenantId,
          emailAccountId: params.emailAccountId,
          isDraft: true,
        },
      }),
      prisma.crmEmailThread.count({
        where: { ...base, trashedAt: null, spamAt: { not: null } },
      }),
      prisma.crmEmailOutbox.count({
        where: {
          tenantId: params.tenantId,
          emailAccountId: params.emailAccountId,
          status: "held",
        },
      }),
    ]);

  return { inbox, inboxUnread, archived, all, trash, snoozed, drafts, spam, scheduled };
}

/** Compatibilidad para call sites previos; los conteos ahora siempre son frescos. */
export function invalidateCorreoFolderCounts(_tenantId: string, _emailAccountId: string) {
  // no-op
}
