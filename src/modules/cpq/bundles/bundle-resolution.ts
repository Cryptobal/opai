/**
 * Resolución de propuestas multi-instalación (proposal bundles).
 *
 * Cada instalación de una propuesta es una `CpqQuote` independiente, pero todas
 * cuelgan del mismo `CrmDeal`. Cuando el cliente aprueba/rechaza UNA instalación
 * desde el Portal Cliente NO se debe cerrar el negocio completo: hay que esperar
 * a que TODAS las cotizaciones incluidas (`includedInProposal === true`) lleguen
 * a un estado terminal antes de propagar el cierre del deal.
 *
 * Reglas:
 * - Si la cotización no pertenece a ningún bundle → el caller aplica el flujo
 *   estándar de cotización individual (esta función no hace nada, `inBundle:false`).
 * - Si pertenece a un bundle pero aún hay incluidas sin resolver → no se propaga.
 * - Si todas las incluidas están en estado terminal:
 *   - Si hay al menos una con negocio (aprobada/aceptada/activa/en curso) → se
 *     resuelve el deal como GANADO (`propagateDealWon`). Si además hubo rechazos
 *     parciales, se registra en `CrmHistoryLog` (entityType `bundle`).
 *   - Si todas fueron rechazadas → se resuelve el deal como PERDIDO
 *     (`propagateDealLost`).
 */

import type { Tx } from "@/lib/crm/deal-propagation-helpers";
import { propagateDealWon, propagateDealLost } from "@/lib/crm/deal-propagation";
import { createCrmHistoryLog } from "@/lib/crm-history";

/** Estados que implican que la cotización ya no espera decisión del cliente. */
export const BUNDLE_TERMINAL_STATUSES = [
  "approved",
  "accepted",
  "rejected",
  "active",
  "in_progress",
] as const;

/** Estados terminales que implican negocio real (hay adjudicación). */
export const BUNDLE_WON_STATUSES = [
  "approved",
  "accepted",
  "active",
  "in_progress",
] as const;

export type BundleResolutionOutcome =
  | { inBundle: false }
  | {
      inBundle: true;
      resolved: false;
      bundleId: string;
      dealId: string;
      pendingQuoteIds: string[];
    }
  | {
      inBundle: true;
      resolved: true;
      outcome: "won" | "lost";
      partialRejection: boolean;
      bundleId: string;
      dealId: string;
    };

type StageKind = "won" | "lost";

/**
 * Mueve el deal a la etapa de cierre correspondiente (crea la etapa si falta),
 * fija su `status` y propaga el cierre. Comparte lógica de etapas con las rutas
 * standalone para no divergir.
 */
async function resolveDealStage(
  tx: Tx,
  tenantId: string,
  dealId: string,
  kind: StageKind,
): Promise<void> {
  if (kind === "won") {
    let stage = await tx.crmPipelineStage.findFirst({
      where: { tenantId, name: { contains: "Aprobado" } },
    });
    if (!stage) {
      stage = await tx.crmPipelineStage.create({
        data: { tenantId, name: "Aprobado por Cliente", isActive: true, order: 99 },
      });
    }
    await tx.crmDeal.update({
      where: { id: dealId },
      data: { stageId: stage.id, status: "won" },
    });
    await propagateDealWon(tx, tenantId, dealId);
    return;
  }

  let stage = await tx.crmPipelineStage.findFirst({
    where: { tenantId, name: { contains: "Perdid", mode: "insensitive" } },
  });
  if (!stage) {
    stage = await tx.crmPipelineStage.create({
      data: { tenantId, name: "Perdido", isActive: true, order: 100 },
    });
  }
  await tx.crmDeal.update({
    where: { id: dealId },
    data: { stageId: stage.id, status: "lost" },
  });
  await propagateDealLost(tx, tenantId, dealId);
}

/**
 * Evalúa si el bundle al que pertenece `quoteId` está totalmente resuelto y, en
 * ese caso, propaga el cierre del deal. Debe llamarse DESPUÉS de haber
 * actualizado el estado de la cotización que gatilla la evaluación.
 *
 * Debe ejecutarse dentro de una transacción (recibe `tx`).
 */
export async function maybePropagateBundleDealResolution(
  tx: Tx,
  tenantId: string,
  quoteId: string,
): Promise<BundleResolutionOutcome> {
  const member = await tx.cpqProposalBundleQuote.findFirst({
    where: { quoteId, tenantId },
    select: { bundleId: true },
  });
  if (!member) return { inBundle: false };

  const bundle = await tx.cpqProposalBundle.findFirst({
    where: { id: member.bundleId, tenantId },
    select: { id: true, code: true, dealId: true },
  });
  // Bundle huérfano/inconsistente: no forzamos propagación de bundle.
  if (!bundle) return { inBundle: false };

  const includedMembers = await tx.cpqProposalBundleQuote.findMany({
    where: { bundleId: bundle.id, tenantId, includedInProposal: true },
    select: { quoteId: true },
  });
  const includedQuoteIds = includedMembers.map((m) => m.quoteId);

  if (includedQuoteIds.length === 0) {
    return {
      inBundle: true,
      resolved: false,
      bundleId: bundle.id,
      dealId: bundle.dealId,
      pendingQuoteIds: [],
    };
  }

  const quotes = await tx.cpqQuote.findMany({
    where: { tenantId, id: { in: includedQuoteIds } },
    select: { id: true, status: true },
  });

  const terminal = new Set<string>(BUNDLE_TERMINAL_STATUSES);
  const won = new Set<string>(BUNDLE_WON_STATUSES);

  const pendingQuoteIds = quotes
    .filter((q) => !terminal.has(q.status))
    .map((q) => q.id);

  // Si falta alguna incluida por resolver (o alguna no se pudo leer) → esperar.
  if (pendingQuoteIds.length > 0 || quotes.length !== includedQuoteIds.length) {
    return {
      inBundle: true,
      resolved: false,
      bundleId: bundle.id,
      dealId: bundle.dealId,
      pendingQuoteIds,
    };
  }

  const wonQuoteIds = quotes.filter((q) => won.has(q.status)).map((q) => q.id);
  const rejectedQuoteIds = quotes
    .filter((q) => q.status === "rejected")
    .map((q) => q.id);
  const hasBusiness = wonQuoteIds.length > 0;
  const partialRejection = hasBusiness && rejectedQuoteIds.length > 0;

  if (hasBusiness) {
    await resolveDealStage(tx, tenantId, bundle.dealId, "won");
    if (partialRejection) {
      await createCrmHistoryLog(
        {
          tenantId,
          entityType: "bundle",
          entityId: bundle.id,
          action: "bundle_partial_rejection",
          details: {
            code: bundle.code,
            approvedQuoteIds: wonQuoteIds,
            rejectedQuoteIds,
          },
          createdBy: null,
        },
        tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
      );
    }
    return {
      inBundle: true,
      resolved: true,
      outcome: "won",
      partialRejection,
      bundleId: bundle.id,
      dealId: bundle.dealId,
    };
  }

  await resolveDealStage(tx, tenantId, bundle.dealId, "lost");
  return {
    inBundle: true,
    resolved: true,
    outcome: "lost",
    partialRejection: false,
    bundleId: bundle.id,
    dealId: bundle.dealId,
  };
}
