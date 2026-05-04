/**
 * Propagación de estados Deal ↔ Quote ↔ Installation.
 *
 * Reglas:
 * - Al ganar un deal: marca quote ganadora como 'approved', hermanas como 'rejected',
 *   activa instalación si está en prospect/inactive, setea activatedByDealId.
 * - Al perder un deal: rechaza quotes abiertas. NUNCA desactiva instalación
 *   automáticamente; retorna candidata desactivable para que UI confirme.
 *
 * Una instalación es candidata a desactivación SOLO si cumple las TRES condiciones:
 *   1. activatedByDealId === deal.id (este deal la activó)
 *   2. Sin operación real (sin pautas, asistencias ni marcaciones)
 *   3. Ningún otro deal won del tenant tiene quote approved apuntando a ella
 */

import type { Prisma } from "@prisma/client";
import {
  type Tx,
  pickWinningQuote,
  hasOperationalActivity,
  hasOtherWonDealUsingInstallation,
  collectSiblingQuoteIds,
  collectOpenQuoteIds,
} from "./deal-propagation-helpers";

export {
  pickWinningQuote,
  hasOperationalActivity,
  hasOtherWonDealUsingInstallation,
};

export interface DealWonPropagationResult {
  winningQuoteId: string | null;
  rejectedQuoteIds: string[];
  activatedInstallationId: string | null;
  activatedByDealIdSet: boolean;
}

export interface DealLostPropagationResult {
  rejectedQuoteIds: string[];
  /** Instalación candidata a desactivación (cumple las 3 condiciones). UI debe confirmar. */
  deactivationCandidate: {
    installationId: string;
    installationName: string;
  } | null;
}

/** Propaga el cierre ganado de un deal. */
export async function propagateDealWon(
  tx: Tx,
  tenantId: string,
  dealId: string
): Promise<DealWonPropagationResult> {
  const result: DealWonPropagationResult = {
    winningQuoteId: null,
    rejectedQuoteIds: [],
    activatedInstallationId: null,
    activatedByDealIdSet: false,
  };

  const winning = await pickWinningQuote(tx, tenantId, dealId);
  if (!winning) return result;

  result.winningQuoteId = winning.id;

  if (winning.status !== "approved") {
    await tx.cpqQuote.update({
      where: { id: winning.id },
      data: { status: "approved" },
    });
  }

  const siblingIds = await collectSiblingQuoteIds(tx, tenantId, dealId, winning.id);
  if (siblingIds.length > 0) {
    const updateRes = await tx.cpqQuote.updateMany({
      where: {
        tenantId,
        id: { in: siblingIds },
        status: { in: ["draft", "sent"] },
      },
      data: { status: "rejected" },
    });
    if (updateRes.count > 0) {
      result.rejectedQuoteIds = siblingIds;
    }
  }

  if (winning.installationId) {
    const inst = await tx.crmInstallation.findFirst({
      where: { id: winning.installationId, tenantId },
      select: { id: true, status: true, activatedByDealId: true },
    });

    if (inst) {
      const updates: Prisma.CrmInstallationUpdateInput = {};
      if (inst.status === "prospect" || inst.status === "inactive") {
        updates.status = "active";
        updates.isActive = true;
        updates.nocturnoEnabled = true;
        updates.chatEnabled = true;
        result.activatedInstallationId = inst.id;
      }
      if (!inst.activatedByDealId) {
        updates.activatedByDeal = { connect: { id: dealId } };
        result.activatedByDealIdSet = true;
      }
      if (Object.keys(updates).length > 0) {
        await tx.crmInstallation.update({ where: { id: inst.id }, data: updates });
      }
    }
  }

  await tx.crmDeal.update({
    where: { id: dealId },
    data: { activeQuotationId: winning.id },
  });

  return result;
}

/** Propaga el cierre perdido de un deal. */
export async function propagateDealLost(
  tx: Tx,
  tenantId: string,
  dealId: string
): Promise<DealLostPropagationResult> {
  const result: DealLostPropagationResult = {
    rejectedQuoteIds: [],
    deactivationCandidate: null,
  };

  const openIds = await collectOpenQuoteIds(tx, tenantId, dealId);
  if (openIds.length > 0) {
    await tx.cpqQuote.updateMany({
      where: { tenantId, id: { in: openIds } },
      data: { status: "rejected" },
    });
    result.rejectedQuoteIds = openIds;
  }

  const candidateInstallations = await tx.crmInstallation.findMany({
    where: { tenantId, activatedByDealId: dealId, status: "active" },
    select: { id: true, name: true },
  });

  for (const inst of candidateInstallations) {
    const [hasOps, otherWon] = await Promise.all([
      hasOperationalActivity(tx, tenantId, inst.id),
      hasOtherWonDealUsingInstallation(tx, tenantId, inst.id, dealId),
    ]);
    if (!hasOps && !otherWon) {
      result.deactivationCandidate = {
        installationId: inst.id,
        installationName: inst.name,
      };
      break;
    }
  }

  return result;
}
