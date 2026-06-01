import "server-only";
import { prisma } from "@/lib/prisma";

export async function loadDteDateOverrides(
  tenantId: string,
  dteIds: string[],
): Promise<Map<string, string>> {
  if (dteIds.length === 0) return new Map();
  const rows = await prisma.financeCashflowDteDateOverride.findMany({
    where: { tenantId, dteId: { in: dteIds } },
    select: { dteId: true, customDate: true },
  });
  return new Map(rows.map((r) => [r.dteId, r.customDate.toISOString().slice(0, 10)]));
}

export async function upsertDteDateOverride(args: {
  tenantId: string;
  dteId: string;
  customDate: Date;
  createdBy: string;
  reason?: string | null;
}): Promise<void> {
  const { tenantId, dteId, customDate, createdBy, reason } = args;
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { id: true, date: true },
  });
  if (!dte) throw new Error("DTE no encontrado");

  await prisma.financeCashflowDteDateOverride.upsert({
    where: { tenantId_dteId: { tenantId, dteId } },
    create: {
      tenantId,
      dteId,
      originalDate: dte.date,
      customDate,
      createdBy,
      reason: reason ?? null,
    },
    update: {
      customDate,
      reason: reason ?? null,
    },
  });
}

export async function clearDteDateOverride(
  tenantId: string,
  dteId: string,
): Promise<void> {
  await prisma.financeCashflowDteDateOverride.deleteMany({
    where: { tenantId, dteId },
  });
}

/**
 * Mueve un DTE en el flujo de caja a una nueva fecha de VISIBILIDAD (override),
 * sin tocar FinanceDte ni SII. Para huérfanos sin programación. Multi-tenant.
 */
export async function moveDteByOverride(args: {
  tenantId: string;
  dteId: string;
  createdBy: string;
  newDate?: Date | null;
  daysFromCurrent?: number | null;
  reason?: string | null;
}): Promise<{ customDate: string }> {
  const { tenantId, dteId, createdBy } = args;
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { id: true, date: true },
  });
  if (!dte) throw new Error("DTE no encontrado");

  const existing = await prisma.financeCashflowDteDateOverride.findUnique({
    where: { tenantId_dteId: { tenantId, dteId } },
    select: { customDate: true },
  });
  const baseDate = existing?.customDate ?? dte.date;

  let target: Date;
  if (args.newDate) {
    target = args.newDate;
  } else if (args.daysFromCurrent != null) {
    target = new Date(baseDate);
    target.setUTCDate(target.getUTCDate() + args.daysFromCurrent);
  } else {
    throw new Error("Se requiere newDate o daysFromCurrent");
  }
  const customDate = new Date(Date.UTC(
    target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(),
  ));
  await upsertDteDateOverride({ tenantId, dteId, customDate, createdBy, reason: args.reason ?? null });
  return { customDate: customDate.toISOString().slice(0, 10) };
}
