import { prisma } from "@/lib/prisma";
import { notSnoozedWhere } from "./correos-list";

export type CorreoFolderCounts = {
  inbox: number;
  inboxUnread: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
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
  const [inbox, inboxUnread, archived, all, trash, snoozed] = await Promise.all([
    prisma.crmEmailThread.count({
      where: { ...base, trashedAt: null, archivedAt: null, spamAt: null, ...notSnoozed },
    }),
    prisma.crmEmailThread.count({
      where: { ...base, trashedAt: null, archivedAt: null, spamAt: null, isUnread: true, ...notSnoozed },
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
  ]);

  return { inbox, inboxUnread, archived, all, trash, snoozed };
}

/** Compatibilidad para call sites previos; los conteos ahora siempre son frescos. */
export function invalidateCorreoFolderCounts(_tenantId: string, _emailAccountId: string) {
  // no-op
}
