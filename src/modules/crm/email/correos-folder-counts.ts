import { prisma } from "@/lib/prisma";

export type CorreoFolderCounts = {
  inbox: number;
  archived: number;
  trash: number;
};

type CacheEntry = { at: number; counts: CorreoFolderCounts };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Conteos por pestaña (inbox / archivados / papelera). Cache 60s por casilla. */
export async function countCorreoFolders(params: {
  tenantId: string;
  emailAccountId: string;
}): Promise<CorreoFolderCounts> {
  const key = `${params.tenantId}:${params.emailAccountId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.counts;

  const base = { tenantId: params.tenantId, emailAccountId: params.emailAccountId };
  const [inbox, archived, trash] = await Promise.all([
    prisma.crmEmailThread.count({
      where: { ...base, trashedAt: null, archivedAt: null },
    }),
    prisma.crmEmailThread.count({
      where: { ...base, trashedAt: null, archivedAt: { not: null } },
    }),
    prisma.crmEmailThread.count({
      where: { ...base, trashedAt: { not: null } },
    }),
  ]);

  const counts = { inbox, archived, trash };
  cache.set(key, { at: Date.now(), counts });
  return counts;
}

/** Invalida cache de conteos (tras sync o acción de bandeja). */
export function invalidateCorreoFolderCounts(tenantId: string, emailAccountId: string) {
  cache.delete(`${tenantId}:${emailAccountId}`);
}
