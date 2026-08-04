import "server-only";
import {
  excludeDteFromFlow,
  includeDteInFlow,
  loadExcludedDteIds,
} from "@/modules/finance/cashflow/dte-exclusion.service";
import { prisma } from "@/lib/prisma";

const REASON_MIN = 5;
const REASON_MAX = 300;

/**
 * Capa v3 sobre el servicio de exclusión v2 (`FinanceCashflowDteFlowExclusion`).
 * El modelo ya existía en el schema (no se crea `FlowIncomeDteExclusion` duplicado);
 * aquí se endurece razón obligatoria y scoping tenant.
 */

export async function listIncomeExclusions(tenantId: string) {
  return prisma.financeCashflowDteFlowExclusion.findMany({
    where: { tenantId },
    select: {
      dteId: true,
      reason: true,
      createdBy: true,
      createdAt: true,
      dte: { select: { folio: true, receiverName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function excludeIncomeDte(args: {
  tenantId: string;
  userId: string;
  dteId: string;
  reason: string;
}): Promise<void> {
  const reason = (args.reason ?? "").trim();
  if (reason.length < REASON_MIN) {
    throw new Error(`reason requerido (mínimo ${REASON_MIN} caracteres)`);
  }
  if (reason.length > REASON_MAX) {
    throw new Error(`reason demasiado largo (máx. ${REASON_MAX})`);
  }
  await excludeDteFromFlow({
    tenantId: args.tenantId,
    dteId: args.dteId,
    createdBy: args.userId,
    reason: reason.slice(0, REASON_MAX),
  });
}

export async function restoreIncomeDte(tenantId: string, dteId: string): Promise<void> {
  // Verificar pertenencia antes de borrar (includeDteInFlow ya es tenant-scoped,
  // pero confirmamos que el DTE existe en el tenant para un 400 claro).
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { id: true },
  });
  if (!dte) throw new Error("DTE no encontrado");
  await includeDteInFlow(tenantId, dteId);
}

/**
 * Exclusión masiva transaccional (cartera antigua / bandeja por grupo).
 * Valida pertenencia de cada DTE al tenant antes de escribir.
 */
export async function excludeIncomeDteBulk(args: {
  tenantId: string;
  userId: string;
  dteIds: string[];
  reason: string;
}): Promise<{ excluded: number; skipped: string[] }> {
  const reason = (args.reason ?? "").trim();
  if (reason.length < REASON_MIN) {
    throw new Error(`reason requerido (mínimo ${REASON_MIN} caracteres)`);
  }
  if (reason.length > REASON_MAX) {
    throw new Error(`reason demasiado largo (máx. ${REASON_MAX})`);
  }
  if (args.dteIds.length === 0) return { excluded: 0, skipped: [] };

  const owned = await prisma.financeDte.findMany({
    where: {
      tenantId: args.tenantId,
      id: { in: args.dteIds },
      direction: "ISSUED",
    },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  const skipped = args.dteIds.filter((id) => !ownedIds.has(id));
  const toExclude = args.dteIds.filter((id) => ownedIds.has(id));

  await prisma.$transaction(async () => {
    for (const dteId of toExclude) {
      await excludeDteFromFlow({
        tenantId: args.tenantId,
        dteId,
        createdBy: args.userId,
        reason: reason.slice(0, REASON_MAX),
      });
    }
  });

  return { excluded: toExclude.length, skipped };
}

export { loadExcludedDteIds };
