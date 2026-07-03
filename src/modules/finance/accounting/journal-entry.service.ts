/**
 * Journal Entry Service
 * Create, post, and reverse journal entries with double-entry validation
 */

import { prisma } from "@/lib/prisma";
import { validateDoubleEntry } from "../shared/validators/journal.validator";
import type { JournalEntryInput } from "../shared/types/accounting.types";
import { openPeriod } from "./period.service";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/notify";

const fmtPeriod = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/**
 * Resuelve el período contable OPEN para la fecha contable de un asiento,
 * abriéndolo perezosamente si no existe.
 *
 * Filosofía (prompt 12): la APERTURA de un período es plomería invisible —
 * facturar en julio debe contabilizar en julio sin que nadie "abra" nada.
 * El CIERRE, en cambio, es un acto humano: si el período existe pero está
 * CLOSED/LOCKED, se mantiene el error accionable (contabilizar en mes cerrado
 * sigue siendo un error que el contador debe resolver explícitamente).
 *
 * Regla de sanidad: no auto-abrimos un mes pasado si ya existe algún período
 * POSTERIOR cerrado — eso significaría resucitar historia contable por un
 * documento mal fechado. En ese caso, error claro.
 *
 * Concurrencia: dos asientos del mismo mes recién estrenado pueden carrera a
 * crear el período; capturamos el P2002 del unique (tenant, year, month) y
 * releemos.
 */
async function resolvePeriodForEntry(
  tenantId: string,
  year: number,
  month: number,
  actorId: string,
) {
  const existing = await prisma.financeAccountingPeriod.findUnique({
    where: { tenantId_year_month: { tenantId, year, month } },
  });

  if (existing) {
    if (existing.status !== "OPEN") {
      throw new Error(`El periodo ${fmtPeriod(year, month)} esta cerrado`);
    }
    return existing;
  }

  // El período no existe → auto-apertura perezosa, salvo que haya un período
  // posterior ya cerrado (protección contra documentos mal fechados).
  const target = year * 12 + (month - 1);
  const laterClosed = await prisma.financeAccountingPeriod.findFirst({
    where: { tenantId, status: { in: ["CLOSED", "LOCKED"] } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  if (laterClosed && laterClosed.year * 12 + (laterClosed.month - 1) > target) {
    throw new Error(
      `No se puede contabilizar en ${fmtPeriod(year, month)}: ya hay un período posterior (${fmtPeriod(laterClosed.year, laterClosed.month)}) cerrado. Revisa la fecha del documento.`,
    );
  }

  try {
    const created = await openPeriod(tenantId, year, month);
    await logAudit({
      tenantId,
      userId: actorId,
      action: "CREATE",
      entity: "finance_accounting_period",
      entityId: created.id,
      details: {
        event: "accounting_period_auto_opened",
        year,
        month,
        trigger: "journal_entry",
      },
    });
    // Aviso informativo único: el período nació solo. No bloquea el asiento.
    const periodLabel = `${MONTH_NAMES_ES[month - 1]} ${year}`;
    notify({
      tenantId,
      type: "accounting_period_auto_opened",
      title: `Período ${periodLabel} abierto automáticamente`,
      body: `${periodLabel} se abrió solo con el primer asiento del mes. No necesitas abrirlo manualmente.`,
      link: "/finanzas/contabilidad",
      data: { year, month, periodId: created.id },
    }).catch((err) =>
      console.error("[journal-entry] notify accounting_period_auto_opened falló:", err),
    );
    return created;
  } catch (err) {
    // Carrera: otro asiento creó el mismo período entre nuestro findUnique y
    // el create. openPeriod puede fallar por el P2002 del unique o por su
    // propio guard "ya existe"; en ambos casos releemos y, si el período
    // materializó, lo usamos (validando que quedó OPEN).
    const raced = await prisma.financeAccountingPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } },
    });
    if (raced) {
      if (raced.status !== "OPEN") {
        throw new Error(`El periodo ${fmtPeriod(year, month)} esta cerrado`);
      }
      return raced;
    }
    throw err;
  }
}

/**
 * Create a manual journal entry (saved as DRAFT)
 */
export async function createManualEntry(
  tenantId: string,
  createdBy: string,
  input: JournalEntryInput
) {
  // Validate double entry
  const validation = validateDoubleEntry(input.lines);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Resolver período por la FECHA CONTABLE del asiento (input.date, no now()):
  // facturar en julio contabiliza en julio. Si el mes aún no tiene período, se
  // abre solo (auto-apertura perezosa); si existe pero está cerrado, el error
  // se mantiene intacto.
  const entryDate = new Date(input.date);
  const year = entryDate.getFullYear();
  const month = entryDate.getMonth() + 1;

  const period = await resolvePeriodForEntry(tenantId, year, month, createdBy);

  // Validate all accounts exist and accept entries
  const accountIds = input.lines.map((l) => l.accountId);
  const accounts = await prisma.financeAccountPlan.findMany({
    where: { id: { in: accountIds }, tenantId },
  });
  if (accounts.length !== accountIds.length) {
    throw new Error("Una o mas cuentas no existen");
  }
  const nonAccepting = accounts.filter((a) => !a.acceptsEntries);
  if (nonAccepting.length > 0) {
    throw new Error(`La cuenta ${nonAccepting[0].code} no acepta movimientos`);
  }

  // Auto-generate number
  const lastEntry = await prisma.financeJournalEntry.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const nextNumber = (lastEntry?.number ?? 0) + 1;

  // Create entry with lines
  return prisma.financeJournalEntry.create({
    data: {
      tenantId,
      number: nextNumber,
      date: entryDate,
      periodId: period.id,
      description: input.description,
      reference: input.reference ?? null,
      sourceType: (input.sourceType as any) ?? "MANUAL",
      sourceId: input.sourceId ?? null,
      costCenterId: input.costCenterId ?? null,
      status: "DRAFT",
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      createdBy,
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description ?? null,
          debit: line.debit,
          credit: line.credit,
          costCenterId: line.costCenterId ?? null,
          thirdPartyId: line.thirdPartyId ?? null,
          thirdPartyType: line.thirdPartyType ? (line.thirdPartyType as any) : null,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * Post an entry (DRAFT -> POSTED)
 */
export async function postEntry(
  tenantId: string,
  entryId: string,
  postedBy: string
) {
  const entry = await prisma.financeJournalEntry.findFirst({
    where: { id: entryId, tenantId },
  });
  if (!entry) throw new Error("Asiento no encontrado");
  if (entry.status !== "DRAFT") throw new Error("Solo se pueden contabilizar asientos en borrador");

  return prisma.financeJournalEntry.update({
    where: { id: entryId },
    data: {
      status: "POSTED",
      postedBy,
      postedAt: new Date(),
    },
    include: { lines: true },
  });
}

/**
 * Reverse an entry (creates a new reverse entry)
 */
export async function reverseEntry(
  tenantId: string,
  entryId: string,
  reversedBy: string,
  reverseDate: string
) {
  const entry = await prisma.financeJournalEntry.findFirst({
    where: { id: entryId, tenantId },
    include: { lines: true },
  });
  if (!entry) throw new Error("Asiento no encontrado");
  if (entry.status !== "POSTED") throw new Error("Solo se pueden reversar asientos contabilizados");

  // Create reverse entry with swapped debit/credit
  const reverseInput: JournalEntryInput = {
    date: reverseDate,
    description: `Reverso de asiento #${entry.number}`,
    reference: `REV-${entry.number}`,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId ?? undefined,
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      description: line.description ?? undefined,
      debit: Number(line.credit), // Swap
      credit: Number(line.debit), // Swap
      costCenterId: line.costCenterId ?? undefined,
      thirdPartyId: line.thirdPartyId ?? undefined,
      thirdPartyType: line.thirdPartyType as any,
    })),
  };

  const reverseEntry = await createManualEntry(tenantId, reversedBy, reverseInput);

  // Post the reverse entry immediately
  await postEntry(tenantId, reverseEntry.id, reversedBy);

  // Mark original as reversed
  await prisma.financeJournalEntry.update({
    where: { id: entryId },
    data: { status: "REVERSED", reversedById: reverseEntry.id },
  });

  return reverseEntry;
}

/**
 * Get a single entry with lines
 */
export async function getEntry(tenantId: string, entryId: string) {
  const entry = await prisma.financeJournalEntry.findFirst({
    where: { id: entryId, tenantId },
    include: {
      lines: {
        include: { account: { select: { code: true, name: true } } },
      },
      period: { select: { year: true, month: true } },
    },
  });
  if (!entry) throw new Error("Asiento no encontrado");
  return entry;
}

/**
 * List entries with filters and pagination
 */
export async function listEntries(
  tenantId: string,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    sourceType?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: any = { tenantId };
  if (filters?.status) where.status = filters.status;
  if (filters?.sourceType) where.sourceType = filters.sourceType;
  if (filters?.dateFrom || filters?.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
  }

  const [entries, total] = await Promise.all([
    prisma.financeJournalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      skip,
      take: pageSize,
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
        },
      },
    }),
    prisma.financeJournalEntry.count({ where }),
  ]);

  return { entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
