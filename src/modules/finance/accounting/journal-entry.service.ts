/**
 * Journal Entry Service
 * Create, post, and reverse journal entries with double-entry validation
 */

import { prisma } from "@/lib/prisma";
import { validateDoubleEntry } from "../shared/validators/journal.validator";
import type { JournalEntryInput } from "../shared/types/accounting.types";

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

  // Find period for the date
  const entryDate = new Date(input.date);
  const year = entryDate.getFullYear();
  const month = entryDate.getMonth() + 1;

  const period = await prisma.financeAccountingPeriod.findUnique({
    where: {
      tenantId_year_month: { tenantId, year, month },
    },
  });
  if (!period) {
    throw new Error(`No existe periodo contable para ${year}-${String(month).padStart(2, "0")}`);
  }
  if (period.status !== "OPEN") {
    throw new Error(`El periodo ${year}-${String(month).padStart(2, "0")} esta cerrado`);
  }

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
