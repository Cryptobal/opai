/**
 * Folio Tracker Service
 *
 * Manages the next available folio per (tenant, dteType) by reading
 * from active CAFs (TenantDteCaf) and tracking consumption in TenantDteFolioTracker.
 *
 * CRITICAL: folio assignment must happen inside a Prisma transaction
 * with row-level locking to prevent double-issuance under concurrency.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export class FolioExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolioExhaustedError";
  }
}

export class CafNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CafNotFoundError";
  }
}

/**
 * Reserve the next folio for a given DTE type. Must be called inside a transaction.
 * Returns { folio, cafId, xmlData (Buffer) } so the caller can build the timbre.
 *
 * If reservation succeeds but the DTE issuance later fails, the caller MUST
 * call rollbackFolio(tenantId, dteType, folio) — but this is automatic if
 * the entire emission happens inside one Prisma.$transaction block.
 */
export async function reserveNextFolio(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dteType: number
): Promise<{ folio: number; cafId: string; cafXml: Buffer }> {
  // 1. Look up tracker
  const tracker = await tx.tenantDteFolioTracker.findUnique({
    where: { tenantId_dteType: { tenantId, dteType } },
  });

  if (tracker) {
    // Tracker exists, check if its CAF still has space
    const caf = await tx.tenantDteCaf.findUnique({ where: { id: tracker.cafId } });
    if (caf && caf.isActive && tracker.nextFolio <= caf.folioHasta) {
      const folio = tracker.nextFolio;
      await tx.tenantDteFolioTracker.update({
        where: { tenantId_dteType: { tenantId, dteType } },
        data: { nextFolio: folio + 1 },
      });
      return { folio, cafId: caf.id, cafXml: Buffer.from(caf.xmlData) };
    }
    // CAF exhausted or inactive → fall through to find a new CAF
  }

  // 2. Find an active CAF with available folios
  // Pick the CAF with the smallest folioDesde that still has unused range.
  const candidateCafs = await tx.tenantDteCaf.findMany({
    where: { tenantId, dteType, isActive: true },
    orderBy: { folioDesde: "asc" },
  });

  if (candidateCafs.length === 0) {
    throw new CafNotFoundError(
      `No hay CAF activo para tipo DTE ${dteType} en este tenant. Sube un CAF en /opai/configuracion/finanzas/dte.`
    );
  }

  // Determine which folios are already consumed across all DTEs of this tenant+type
  // by checking max folio in finance_dtes.
  const lastIssued = await tx.financeDte.findFirst({
    where: { tenantId, direction: "ISSUED", dteType },
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const lastFolio = lastIssued?.folio ?? 0;

  // Pick first CAF where folioDesde > lastFolio OR lastFolio is within its range.
  let chosenCaf: (typeof candidateCafs)[number] | null = null;
  let nextFolio = 0;
  for (const caf of candidateCafs) {
    if (lastFolio < caf.folioDesde) {
      chosenCaf = caf;
      nextFolio = caf.folioDesde;
      break;
    }
    if (lastFolio >= caf.folioDesde && lastFolio < caf.folioHasta) {
      chosenCaf = caf;
      nextFolio = lastFolio + 1;
      break;
    }
  }

  if (!chosenCaf) {
    throw new FolioExhaustedError(
      `Todos los CAFs de tipo ${dteType} están agotados. Solicita más folios al SII y súbelos.`
    );
  }

  // 3. Upsert tracker
  await tx.tenantDteFolioTracker.upsert({
    where: { tenantId_dteType: { tenantId, dteType } },
    create: {
      tenantId,
      dteType,
      nextFolio: nextFolio + 1,
      cafId: chosenCaf.id,
    },
    update: {
      nextFolio: nextFolio + 1,
      cafId: chosenCaf.id,
    },
  });

  return {
    folio: nextFolio,
    cafId: chosenCaf.id,
    cafXml: Buffer.from(chosenCaf.xmlData),
  };
}

/**
 * Get summary of folio usage per DTE type for UI display.
 */
export async function getFolioSummary(prisma: PrismaClient, tenantId: string) {
  const cafs = await prisma.tenantDteCaf.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ dteType: "asc" }, { folioDesde: "asc" }],
  });

  const lastIssuedByType = await prisma.financeDte.groupBy({
    by: ["dteType"],
    where: { tenantId, direction: "ISSUED" },
    _max: { folio: true },
  });
  const lastFolioMap = new Map(
    lastIssuedByType.map((r) => [r.dteType, r._max.folio ?? 0])
  );

  const byType = new Map<number, { available: number; total: number; ranges: typeof cafs }>();
  for (const caf of cafs) {
    const lastFolio = lastFolioMap.get(caf.dteType) ?? 0;
    const consumedInThisCaf =
      lastFolio >= caf.folioDesde ? Math.min(lastFolio, caf.folioHasta) - caf.folioDesde + 1 : 0;
    const totalInThisCaf = caf.folioHasta - caf.folioDesde + 1;
    const availableInThisCaf = Math.max(0, totalInThisCaf - consumedInThisCaf);

    if (!byType.has(caf.dteType)) {
      byType.set(caf.dteType, { available: 0, total: 0, ranges: [] });
    }
    const entry = byType.get(caf.dteType)!;
    entry.available += availableInThisCaf;
    entry.total += totalInThisCaf;
    entry.ranges.push(caf);
  }

  return Array.from(byType.entries()).map(([dteType, info]) => ({
    dteType,
    foliosAvailable: info.available,
    foliosTotal: info.total,
    rangesCount: info.ranges.length,
    isLow: info.available < info.total * 0.2,
  }));
}
