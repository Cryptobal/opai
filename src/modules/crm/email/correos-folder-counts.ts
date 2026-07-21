import { prisma } from "@/lib/prisma";

export type CorreoFolderCounts = {
  inbox: number;
  inboxUnread: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
};

type CacheEntry = { at: number; counts: CorreoFolderCounts };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Conteos por pestaña (recibidos / archivados / todos / papelera). El spam
 * queda excluido de todas menos papelera (que solo mira trashedAt), como en
 * Gmail. Cache 60s por casilla.
 */
export async function countCorreoFolders(params: {
  tenantId: string;
  emailAccountId: string;
}): Promise<CorreoFolderCounts> {
  const key = `${params.tenantId}:${params.emailAccountId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.counts;

  const base = { tenantId: params.tenantId, emailAccountId: params.emailAccountId };
  const now = new Date();
  const notSnoozed = { NOT: { snoozedUntil: { gt: now } } };
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

  const counts = { inbox, inboxUnread, archived, all, trash, snoozed };
  cache.set(key, { at: Date.now(), counts });
  return counts;
}

/** Invalida cache de conteos (tras sync o acción de bandeja). */
export function invalidateCorreoFolderCounts(tenantId: string, emailAccountId: string) {
  cache.delete(`${tenantId}:${emailAccountId}`);
}
