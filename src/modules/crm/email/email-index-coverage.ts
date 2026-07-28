/**
 * Cobertura de indexación semántica por casilla (chunksIndexed).
 * Cache en memoria con TTL corto para no pagar COUNT en cada tecla.
 */
import { prisma } from "@/lib/prisma";

export type EmailIndexCoverage = {
  totalMessages: number;
  indexedMessages: number;
  pct: number;
  oldestIndexedAt: string | null;
};

const cache = new Map<string, { value: EmailIndexCoverage; expires: number }>();
const TTL_MS = 60_000;

function cacheKey(tenantId: string, emailAccountId: string): string {
  return `${tenantId}:${emailAccountId}`;
}

export function clearEmailIndexCoverageCache(
  tenantId?: string,
  emailAccountId?: string,
): void {
  if (tenantId && emailAccountId) {
    cache.delete(cacheKey(tenantId, emailAccountId));
    return;
  }
  cache.clear();
}

export async function getEmailIndexCoverage(params: {
  tenantId: string;
  emailAccountId: string;
}): Promise<EmailIndexCoverage> {
  const key = cacheKey(params.tenantId, params.emailAccountId);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const [total, indexed, oldest] = await Promise.all([
    prisma.crmEmailMessage.count({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        isDraft: false,
      },
    }),
    prisma.crmEmailMessage.count({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        isDraft: false,
        chunksIndexed: true,
      },
    }),
    prisma.crmEmailMessage.findFirst({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        isDraft: false,
        chunksIndexed: true,
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const pct = total === 0 ? 100 : Math.round((indexed / total) * 100);
  const value: EmailIndexCoverage = {
    totalMessages: total,
    indexedMessages: indexed,
    pct,
    oldestIndexedAt: oldest?.createdAt?.toISOString() ?? null,
  };
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}
