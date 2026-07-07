/**
 * Helper compartido de negocios ADJUDICADOS por iniciar: los de etapas
 * `isAccepted` (ganamos, aún no arranca), ordenados por fecha de inicio del
 * servicio. Señal canónica = `CrmPipelineStage.isAccepted` (NUNCA `stage.name`).
 *
 * Extraído de `pipeline.ts` para no triplicar el query (lo consumen también
 * `digest.ts` y la App Home). Añade un `scope` opcional por dueño de cuenta:
 * sin scope → todos los del tenant (comportamiento histórico); con `ownerId` →
 * solo cuentas cuyo `ownerId`/`portalEjecutivoId` sea ese admin (mismo criterio
 * de `my-deals.ts:myDealsByRisk`, no reinterpretado). Los sin `serviceStartDate`
 * van al final para no perderse.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface AdjudicadoDeal {
  id: string;
  amount: number;
  accountName: string;
  title: string;
  serviceStartDate: Date | null;
  commune: string | null;
}

/** Filtro de alcance. Si viene ownerId, restringe a cuentas de ese admin. */
export interface AdjudicadosScope {
  /** Si se pasa, solo negocios de cuentas cuyo owner/ejecutivo sea este admin. */
  ownerId?: string;
}

/** IDs de etapas adjudicadas (isAccepted) del tenant. */
export async function acceptedStageIds(tenantId: string): Promise<string[]> {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true, isAccepted: true },
    select: { id: true },
  });
  return stages.map((s) => s.id);
}

/**
 * Filtro de ownership reutilizando el criterio de `my-deals.ts:myDealsByRisk`:
 * cuentas cuyo owner o ejecutivo de portal sea el admin dado.
 */
function ownershipWhere(scope?: AdjudicadosScope): Prisma.CrmDealWhereInput {
  if (!scope?.ownerId) return {};
  return { account: { OR: [{ ownerId: scope.ownerId }, { portalEjecutivoId: scope.ownerId }] } };
}

/** Lista adjudicados por iniciar, ordenados por serviceStartDate (nulls last). */
export async function listAdjudicados(
  tenantId: string,
  scope?: AdjudicadosScope,
  take = 25,
): Promise<AdjudicadoDeal[]> {
  const stageIds = await acceptedStageIds(tenantId);
  if (!stageIds.length) return [];
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, stageId: { in: stageIds }, ...ownershipWhere(scope) },
    orderBy: [{ serviceStartDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take,
    select: {
      id: true, title: true, amount: true, serviceStartDate: true,
      commune: true, city: true, account: { select: { name: true } },
    },
  });
  return deals.map((d) => ({
    id: d.id,
    amount: Number(d.amount ?? 0),
    accountName: d.account?.name ?? "Cliente",
    title: d.title ?? "Negocio",
    serviceStartDate: d.serviceStartDate,
    commune: (d.commune || d.city) ?? null,
  }));
}

/** Cuenta adjudicados por iniciar (mismo scope). */
export async function countAdjudicados(
  tenantId: string,
  scope?: AdjudicadosScope,
): Promise<number> {
  const stageIds = await acceptedStageIds(tenantId);
  if (!stageIds.length) return 0;
  return prisma.crmDeal.count({ where: { tenantId, stageId: { in: stageIds }, ...ownershipWhere(scope) } });
}
