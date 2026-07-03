/**
 * Accounting Health Service
 * ─────────────────────────
 * "Salud contable": detectar documentos emitidos que quedaron sin su asiento
 * y repararlos con un clic. El auto-asiento al emitir un DTE (dte-issuer) es
 * best-effort — si falla (plan de cuentas incompleto, período recién cerrado,
 * timeout), el DTE queda huérfano y hoy eso es invisible para el usuario.
 * Este servicio hace ese hueco visible y reparable.
 *
 * Vínculo canónico DTE↔asiento: `FinanceDte.journalEntryId` (seteado por el
 * issuer al postear el asiento). Un documento emitido con `journalEntryId =
 * null` es un huérfano.
 */

import { prisma } from "@/lib/prisma";
import { Prisma, FinanceSiiStatus } from "@prisma/client";
import { buildInvoiceIssuedEntry } from "./auto-entry.builder";
import { createManualEntry, postEntry } from "./journal-entry.service";

/** Tipos de DTE emitido que generan asiento automático (facturas). */
export const ENTRY_ELIGIBLE_DTE_TYPES = [33, 34] as const;

/**
 * Estados SII que se consideran "emitidos" y por tanto deben tener asiento.
 * DRAFT aún no se emitió; REJECTED/ANNULLED no deben contabilizarse.
 */
const EMITTED_SII_STATUSES: FinanceSiiStatus[] = [
  FinanceSiiStatus.PENDING,
  FinanceSiiStatus.SENT,
  FinanceSiiStatus.ACCEPTED,
  FinanceSiiStatus.WITH_OBJECTIONS,
];

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Filtro Prisma canónico de "documento emitido sin asiento".
 * Excluye borradores, rechazados/anulados por SII y facturas anuladas por NC
 * (voidedByCreditNoteId) — esas no deben re-bookearse tarde.
 */
function orphanWhere(
  tenantId: string,
  range?: { year: number; month: number },
): Prisma.FinanceDteWhereInput {
  const where: Prisma.FinanceDteWhereInput = {
    tenantId,
    direction: "ISSUED",
    dteType: { in: [...ENTRY_ELIGIBLE_DTE_TYPES] },
    journalEntryId: null,
    siiStatus: { in: EMITTED_SII_STATUSES },
    voidedByCreditNoteId: null,
  };
  if (range) {
    const gte = new Date(Date.UTC(range.year, range.month - 1, 1));
    const lt = new Date(Date.UTC(range.year, range.month, 1));
    where.date = { gte, lt };
  }
  return where;
}

export interface OrphanDocument {
  id: string;
  folio: number;
  dteType: number;
  date: string;
  receiverName: string;
  totalAmount: number;
  siiStatus: string;
}

/**
 * Lista los documentos emitidos sin asiento del tenant (opcionalmente acotado
 * a un período year/month).
 */
export async function findDocumentsWithoutEntry(
  tenantId: string,
  range?: { year: number; month: number },
): Promise<OrphanDocument[]> {
  const rows = await prisma.financeDte.findMany({
    where: orphanWhere(tenantId, range),
    orderBy: [{ date: "asc" }, { folio: "asc" }],
    select: {
      id: true,
      folio: true,
      dteType: true,
      date: true,
      receiverName: true,
      totalAmount: true,
      siiStatus: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    folio: r.folio,
    dteType: r.dteType,
    date: toYmd(r.date),
    receiverName: r.receiverName,
    totalAmount: Number(r.totalAmount),
    siiStatus: r.siiStatus,
  }));
}

/** Conteo liviano de huérfanos (para cards / cron sin traer las filas). */
export async function countDocumentsWithoutEntry(
  tenantId: string,
  range?: { year: number; month: number },
): Promise<number> {
  return prisma.financeDte.count({ where: orphanWhere(tenantId, range) });
}

export interface CreateEntryResult {
  dteId: string;
  folio: number;
  status: "created" | "skipped" | "failed";
  entryId?: string;
  error?: string;
}

/**
 * Crea (y postea) el asiento de una factura emitida y lo vincula al DTE.
 * IDEMPOTENTE: si el DTE ya tiene `journalEntryId`, no hace nada ("skipped").
 *
 * Reutilizada tanto por el issuer (auto-asiento al emitir) como por la
 * reparación de huérfanos. Errores se devuelven en el resultado (no lanzan)
 * para que el loop de reparación continúe con el resto.
 */
export async function createEntryForDte(
  tenantId: string,
  dteId: string,
  actorId: string,
): Promise<CreateEntryResult> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: {
      id: true,
      folio: true,
      dteType: true,
      direction: true,
      date: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      receiverName: true,
      journalEntryId: true,
    },
  });

  if (!dte) {
    return { dteId, folio: 0, status: "failed", error: "DTE no encontrado" };
  }
  if (dte.journalEntryId) {
    return { dteId, folio: dte.folio, status: "skipped", entryId: dte.journalEntryId };
  }
  if (
    dte.direction !== "ISSUED" ||
    !ENTRY_ELIGIBLE_DTE_TYPES.includes(dte.dteType as (typeof ENTRY_ELIGIBLE_DTE_TYPES)[number])
  ) {
    return {
      dteId,
      folio: dte.folio,
      status: "failed",
      error: "El documento no genera asiento automático (solo facturas emitidas 33/34)",
    };
  }

  try {
    const entryInput = await buildInvoiceIssuedEntry(tenantId, {
      date: toYmd(dte.date),
      folio: dte.folio,
      dteId: dte.id,
      netAmount: Number(dte.netAmount),
      taxAmount: Number(dte.taxAmount),
      totalAmount: Number(dte.totalAmount),
      receiverName: dte.receiverName,
    });

    const entry = await createManualEntry(tenantId, actorId, entryInput);
    await postEntry(tenantId, entry.id, actorId);
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: { journalEntryId: entry.id },
    });

    return { dteId, folio: dte.folio, status: "created", entryId: entry.id };
  } catch (err) {
    return {
      dteId,
      folio: dte.folio,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface GenerateMissingResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: CreateEntryResult[];
}

/**
 * Genera los asientos faltantes para los DTEs indicados. Idempotente por
 * documento (los que ya tienen asiento se saltan). Devuelve resultado por
 * documento para poder mostrar qué se reparó y qué falló.
 */
export async function generateMissingEntries(
  tenantId: string,
  dteIds: string[],
  actorId: string,
): Promise<GenerateMissingResult> {
  const results: CreateEntryResult[] = [];
  for (const id of dteIds) {
    results.push(await createEntryForDte(tenantId, id, actorId));
  }
  return {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
