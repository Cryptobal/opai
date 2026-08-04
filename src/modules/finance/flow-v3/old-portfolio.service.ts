/**
 * Cartera antigua: DTEs de ingreso emitidos antes del corte (o 2025-01-01
 * por defecto) aún no excluidos — para el bloque de limpieza de la bandeja.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDateOnlyUtcYmd } from "@/lib/fx-date";

const DEFAULT_CUTOFF = "2025-01-01";

export async function listOldPortfolio(tenantId: string): Promise<{
  cutoffYmd: string;
  configured: boolean;
  count: number;
  totalClp: number;
  dteIds: string[];
}> {
  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { flowCutoffYmd: true },
  });
  const configured = config?.flowCutoffYmd != null;
  const cutoffYmd = configured
    ? formatDateOnlyUtcYmd(config!.flowCutoffYmd!)
    : DEFAULT_CUTOFF;

  const exclusions = await prisma.financeCashflowDteFlowExclusion.findMany({
    where: { tenantId },
    select: { dteId: true },
  });
  const excludedIds = exclusions.map((e) => e.dteId);

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      dteType: { in: [33, 34] },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
      voidedByCreditNoteId: null,
      paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      date: { lt: new Date(`${cutoffYmd}T00:00:00.000Z`) },
      ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
    },
    select: { id: true, totalAmount: true, amountPaid: true },
    take: 2000,
  });

  let totalClp = 0;
  const dteIds: string[] = [];
  for (const d of dtes) {
    const pending = Number(d.totalAmount) - Number(d.amountPaid ?? 0);
    if (pending <= 0) continue;
    totalClp += pending;
    dteIds.push(d.id);
  }

  return {
    cutoffYmd,
    configured,
    count: dteIds.length,
    totalClp: Math.round(totalClp),
    dteIds,
  };
}
