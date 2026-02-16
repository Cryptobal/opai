/**
 * Folio Service
 * Track DTE folio numbers per type
 */

import { prisma } from "@/lib/prisma";

/**
 * Get the current folio status for each DTE type
 */
export async function getFolioStatus(tenantId: string) {
  const types = [33, 34, 39, 52, 56, 61];

  const results = await Promise.all(
    types.map(async (dteType) => {
      const last = await prisma.financeDte.findFirst({
        where: { tenantId, direction: "ISSUED", dteType },
        orderBy: { folio: "desc" },
        select: { folio: true },
      });

      const count = await prisma.financeDte.count({
        where: { tenantId, direction: "ISSUED", dteType },
      });

      return {
        dteType,
        lastFolio: last?.folio ?? 0,
        nextFolio: (last?.folio ?? 0) + 1,
        totalIssued: count,
      };
    })
  );

  return results;
}
