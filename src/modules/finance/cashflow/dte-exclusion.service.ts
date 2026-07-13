import "server-only";
import { prisma } from "@/lib/prisma";

/** Carga el set de dteIds ocultos del flujo para un tenant (opcionalmente
 *  filtrado a un subconjunto). Usado por buildProjection para no pintar ni
 *  sumar esas facturas. */
export async function loadExcludedDteIds(
  tenantId: string,
  dteIds?: string[],
): Promise<Set<string>> {
  if (dteIds && dteIds.length === 0) return new Set();
  const rows = await prisma.financeCashflowDteFlowExclusion.findMany({
    where: {
      tenantId,
      ...(dteIds ? { dteId: { in: dteIds } } : {}),
    },
    select: { dteId: true },
  });
  return new Set(rows.map((r) => r.dteId));
}

/** Oculta un DTE del flujo. Idempotente. No toca FinanceDte ni SII. */
export async function excludeDteFromFlow(args: {
  tenantId: string;
  dteId: string;
  createdBy: string;
  reason?: string | null;
}): Promise<void> {
  const { tenantId, dteId, createdBy, reason } = args;
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { id: true },
  });
  if (!dte) throw new Error("DTE no encontrado");

  await prisma.financeCashflowDteFlowExclusion.upsert({
    where: { tenantId_dteId: { tenantId, dteId } },
    create: {
      tenantId,
      dteId,
      createdBy,
      reason: reason ?? null,
    },
    update: {
      reason: reason ?? null,
      createdBy,
    },
  });
}

/** Restaura un DTE al flujo (quita la exclusión). Idempotente. */
export async function includeDteInFlow(
  tenantId: string,
  dteId: string,
): Promise<void> {
  await prisma.financeCashflowDteFlowExclusion.deleteMany({
    where: { tenantId, dteId },
  });
}
