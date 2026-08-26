/**
 * Borrado de negocio — mismo camino que DELETE /api/crm/deals/[id]:
 * impacto + bloqueos, cotizaciones a papelera, propuestas, agenda, instalación opcional.
 */
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { deleteQuoteToTrash } from "@/modules/cpq/quote-trash.service";
import {
  buildDealDeleteImpact,
  resolveDealQuoteIds,
  type QuoteDeleteBlocker,
} from "@/modules/cpq/quote-delete-impact";
import {
  cascadeCancelDealAgenda,
  loadDealInstallationImpact,
} from "@/modules/crm/deal-delete-cascade";

export type ExecuteDealDeleteResult =
  | {
      ok: true;
      title: string;
      cascaded: {
        quotes: number;
        bundles: number;
        agendaEvents: number;
        licitacionBands: number;
        installationDeleted: boolean;
        googleErrors: number;
      };
    }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
      blockers?: QuoteDeleteBlocker[];
    };

export async function executeDealDelete(opts: {
  tenantId: string;
  userId: string;
  dealId: string;
  force?: boolean;
  reason?: string | null;
  deleteInstallation?: boolean;
}): Promise<ExecuteDealDeleteResult> {
  const { tenantId, userId, dealId } = opts;
  const force = Boolean(opts.force);
  const reason = opts.reason?.trim() || null;
  const wantDeleteInstallation = Boolean(opts.deleteInstallation);

  const existing = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "Negocio no encontrado" };
  }

  const [quoteIds, impact, bundles] = await Promise.all([
    resolveDealQuoteIds(tenantId, dealId),
    buildDealDeleteImpact(tenantId, dealId),
    prisma.cpqProposalBundle.findMany({
      where: { tenantId, dealId },
      select: { id: true },
    }),
  ]);
  const bundleIds = bundles.map((b) => b.id);

  if (impact && impact.blockers.length > 0 && !force) {
    return {
      ok: false,
      status: 409,
      error: "El negocio tiene cotizaciones con dependencias que impiden eliminarlas",
      blockers: impact.blockers,
    };
  }

  const agendaCascade = await cascadeCancelDealAgenda({
    tenantId,
    dealId,
    actorUserId: userId,
  });

  const installationImpact =
    impact?.installation ?? (await loadDealInstallationImpact(tenantId, dealId, quoteIds));
  const installationIdToDelete =
    wantDeleteInstallation && installationImpact?.canDelete && installationImpact.id
      ? installationImpact.id
      : null;

  const trashedQuoteIds: string[] = [];
  let installationDeleted = false;
  await prisma.$transaction(async (tx) => {
    for (const quoteId of quoteIds) {
      await deleteQuoteToTrash({ tx, tenantId, quoteId, userId, reason });
      trashedQuoteIds.push(quoteId);
    }
    if (bundleIds.length > 0) {
      await tx.cpqProposalBundle.deleteMany({
        where: { id: { in: bundleIds }, tenantId },
      });
    }
    if (installationIdToDelete) {
      await tx.cpqQuote.updateMany({
        where: { tenantId, installationId: installationIdToDelete },
        data: { installationId: null },
      });
      await tx.agendaVisita.updateMany({
        where: { tenantId, installationId: installationIdToDelete },
        data: { installationId: null },
      });
      const deleted = await tx.crmInstallation.deleteMany({
        where: { id: installationIdToDelete, tenantId },
      });
      installationDeleted = deleted.count > 0;
    }
    await tx.crmDeal.delete({ where: { id: dealId } });
    await createCrmHistoryLog(
      {
        tenantId,
        entityType: "deal",
        entityId: dealId,
        action: "deal_deleted",
        details: {
          title: existing.title,
          accountId: existing.accountId,
          cascaded: {
            quotes: trashedQuoteIds,
            bundles: bundleIds,
            agendaEvents: agendaCascade.deletedVisitas,
            licitacionLinkDeleted: agendaCascade.licitacionLinkDeleted,
            installationId: installationIdToDelete,
            installationDeleted,
            googleErrors: agendaCascade.googleErrors,
          },
          reason,
        },
        createdBy: userId,
      },
      tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
    );
  });

  return {
    ok: true,
    title: existing.title,
    cascaded: {
      quotes: trashedQuoteIds.length,
      bundles: bundleIds.length,
      agendaEvents: agendaCascade.deletedVisitas.length,
      licitacionBands: agendaCascade.licitacionLinkDeleted ? 1 : 0,
      installationDeleted,
      googleErrors: agendaCascade.googleErrors.length,
    },
  };
}
