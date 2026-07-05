/**
 * "Mis negocios por riesgo" (Fase 5). El loop persigue NEGOCIOS, no solo
 * cotizaciones. Dueño del negocio = `account.ownerId` (fallback
 * `account.portalEjecutivoId`) — OPAI no modela dueño en el deal.
 *
 * Score de riesgo por timestamps existentes: díasSinActividad ponderado por
 * monto (los grandes pesan más) + antigüedad en etapa. Mayor score = más en
 * riesgo de enfriarse. `tenantId` en cada query.
 */

import { prisma } from "@/lib/prisma";

export interface RiskDeal {
  id: string;
  title: string;
  accountName: string;
  amount: number;
  stageName: string;
  daysInactive: number;
  daysInStage: number;
  contactFirst: string | null;
  contactPhone: string | null;
  score: number;
}

const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

function latest(dates: Array<Date | null | undefined>): Date {
  let max = 0;
  for (const d of dates) if (d && d.getTime() > max) max = d.getTime();
  return max ? new Date(max) : new Date(0);
}

export async function myDealsByRisk(tenantId: string, adminId: string, limit = 15): Promise<RiskDeal[]> {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, status: "open", account: { OR: [{ ownerId: adminId }, { portalEjecutivoId: adminId }] } },
    select: {
      id: true, title: true, amount: true, updatedAt: true,
      account: { select: { name: true } },
      stage: { select: { name: true } },
      primaryContact: { select: { firstName: true, phone: true } },
    },
  });
  if (!deals.length) return [];
  const ids = deals.map((d) => d.id);

  const [notesMax, stageMax] = await Promise.all([
    prisma.crmNote.groupBy({ by: ["entityId"], where: { tenantId, entityType: "deal", entityId: { in: ids } }, _max: { createdAt: true } }),
    prisma.crmDealStageHistory.groupBy({ by: ["dealId"], where: { tenantId, dealId: { in: ids } }, _max: { changedAt: true } }),
  ]);
  const noteAt = new Map(notesMax.map((n) => [n.entityId, n._max.createdAt]));
  const stageAt = new Map(stageMax.map((s) => [s.dealId, s._max.changedAt]));

  const rows: RiskDeal[] = deals.map((d) => {
    const lastActivity = latest([d.updatedAt, noteAt.get(d.id), stageAt.get(d.id)]);
    const daysInactive = daysSince(lastActivity);
    const daysInStage = daysSince(stageAt.get(d.id) ?? d.updatedAt);
    const monto = Number(d.amount ?? 0);
    const montoWeight = 1 + monto / 10_000_000; // negocios grandes pesan más
    const score = daysInactive * montoWeight + daysInStage * 0.5;
    return {
      id: d.id,
      title: (d.title || "Negocio").trim() || "Negocio",
      accountName: (d.account?.name || "Cliente").trim() || "Cliente",
      amount: monto,
      stageName: d.stage?.name ?? "Sin etapa",
      daysInactive,
      daysInStage,
      contactFirst: d.primaryContact?.firstName ?? null,
      contactPhone: d.primaryContact?.phone ?? null,
      score,
    };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, Math.max(1, limit));
}
