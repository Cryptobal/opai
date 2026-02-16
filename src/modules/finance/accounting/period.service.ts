/**
 * Accounting Period Service
 * Manage open/close cycles for monthly accounting periods
 */

import { prisma } from "@/lib/prisma";

/**
 * List all periods for a tenant
 */
export async function listPeriods(tenantId: string) {
  return prisma.financeAccountingPeriod.findMany({
    where: { tenantId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

/**
 * Open a new accounting period
 */
export async function openPeriod(
  tenantId: string,
  year: number,
  month: number
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  // Check no duplicate
  const existing = await prisma.financeAccountingPeriod.findUnique({
    where: {
      tenantId_year_month: { tenantId, year, month },
    },
  });
  if (existing) {
    throw new Error(`El periodo ${year}-${String(month).padStart(2, "0")} ya existe`);
  }

  return prisma.financeAccountingPeriod.create({
    data: {
      tenantId,
      year,
      month,
      startDate,
      endDate,
      status: "OPEN",
    },
  });
}

/**
 * Close a period (no more entries allowed)
 */
export async function closePeriod(
  tenantId: string,
  periodId: string,
  closedBy: string
) {
  const period = await prisma.financeAccountingPeriod.findFirst({
    where: { id: periodId, tenantId },
  });
  if (!period) throw new Error("Periodo no encontrado");
  if (period.status !== "OPEN") throw new Error("Solo se pueden cerrar periodos abiertos");

  // Check all entries are posted
  const draftEntries = await prisma.financeJournalEntry.count({
    where: { periodId, tenantId, status: "DRAFT" },
  });
  if (draftEntries > 0) {
    throw new Error(`Hay ${draftEntries} asientos en borrador. Contabilice o elimine antes de cerrar.`);
  }

  return prisma.financeAccountingPeriod.update({
    where: { id: periodId },
    data: {
      status: "CLOSED",
      closedBy,
      closedAt: new Date(),
    },
  });
}
