/**
 * Cobertura de indexación semántica por conjunto de casillas.
 * Cuenta mensajes con al menos un chunk real en `crm.email_chunks`
 * (no el flag `chunksIndexed`, que puede mentir tras cortes por deadline).
 * Cache en memoria con TTL corto para no pagar COUNT en cada tecla.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailAccountIdsInSql } from "./correos-search";

export type EmailIndexCoverage = {
  totalMessages: number;
  indexedMessages: number;
  pct: number;
  oldestIndexedAt: string | null;
};

const cache = new Map<string, { value: EmailIndexCoverage; expires: number }>();
const TTL_MS = 60_000;

function cacheKey(tenantId: string, emailAccountIds: string[]): string {
  return `${tenantId}:${emailAccountIds.slice().sort().join(",")}`;
}

export function clearEmailIndexCoverageCache(
  tenantId?: string,
  emailAccountIds?: string | string[],
): void {
  if (tenantId && emailAccountIds) {
    const ids = Array.isArray(emailAccountIds) ? emailAccountIds : [emailAccountIds];
    cache.delete(cacheKey(tenantId, ids));
    return;
  }
  cache.clear();
}

export async function getEmailIndexCoverage(params: {
  tenantId: string;
  emailAccountIds: string[];
}): Promise<EmailIndexCoverage> {
  if (params.emailAccountIds.length === 0) {
    return {
      totalMessages: 0,
      indexedMessages: 0,
      pct: 100,
      oldestIndexedAt: null,
    };
  }
  const key = cacheKey(params.tenantId, params.emailAccountIds);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const accountFilter = emailAccountIdsInSql(
    params.emailAccountIds,
    Prisma.sql`c.email_account_id`,
  );

  const [total, indexedRows, oldest] = await Promise.all([
    prisma.crmEmailMessage.count({
      where: {
        tenantId: params.tenantId,
        emailAccountId: { in: params.emailAccountIds },
        isDraft: false,
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT c.message_id)::bigint AS count
      FROM crm.email_chunks c
      WHERE c.tenant_id = ${params.tenantId}
        AND ${accountFilter}
    `),
    prisma.$queryRaw<Array<{ oldest: Date | null }>>(Prisma.sql`
      SELECT MIN(c.created_at) AS oldest
      FROM crm.email_chunks c
      WHERE c.tenant_id = ${params.tenantId}
        AND ${accountFilter}
    `),
  ]);

  const indexed = Number(indexedRows[0]?.count ?? 0);
  const pct = total === 0 ? 100 : Math.round((indexed / total) * 100);
  const value: EmailIndexCoverage = {
    totalMessages: total,
    indexedMessages: indexed,
    pct,
    oldestIndexedAt: oldest[0]?.oldest?.toISOString() ?? null,
  };
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}
