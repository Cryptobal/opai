/**
 * Orquesta una propuesta multi-instalación (CpqProposalBundle PROP) con
 * una CpqQuote por instalación que tenga puestos en el plan de acciones.
 */
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { createBundle } from "@/modules/cpq/bundles/bundle.service";
import { linkQuoteToBundle } from "@/modules/cpq/bundles/bundle-members.service";
import { createPlanQuote } from "./plan-create-quote";
import type { CrmStructureProposal, PlanQuoteInput } from "./email-to-crm-structure.types";

export type PlanMultiQuoteResult = {
  bundleId: string;
  bundleCode: string;
  bundleUrl: string;
  quotes: Array<{
    id: string;
    code: string;
    url: string;
    installationName: string;
    positionsCreated: number;
  }>;
  positionsCreated: number;
};

/**
 * Match installationId: primer createdInstallation con el mismo nombre
 * que aún no fue consumido (soporta nombres duplicados).
 */
function consumeInstallationId(
  createdInstallations: Array<{ id: string; name: string }>,
  name: string,
  consumed: Set<string>,
): string | undefined {
  const match = createdInstallations.find(
    (c) => c.name === name && !consumed.has(c.id),
  );
  if (!match) return undefined;
  consumed.add(match.id);
  return match.id;
}

export async function createPlanQuotesMultiInstallation(params: {
  tenantId: string;
  userId: string;
  dealId: string;
  accountId: string;
  contactId?: string;
  threadId?: string;
  proposal: CrmStructureProposal;
  quoteInput?: PlanQuoteInput;
  createdInstallations: Array<{ id: string; name: string }>;
}): Promise<PlanMultiQuoteResult> {
  const {
    tenantId,
    userId,
    dealId,
    accountId,
    contactId,
    threadId,
    proposal,
    quoteInput,
  } = params;

  const indicesWithSlots = proposal.installations
    .map((inst, idx) => ({ inst, idx }))
    .filter(({ inst }) => inst.coverageSlots.length > 0);

  if (indicesWithSlots.length === 0) {
    throw new Error("Sin instalaciones con puestos para propuesta multi");
  }

  const baseName =
    quoteInput?.name?.trim() ||
    proposal.deal.title?.trim() ||
    proposal.account.name ||
    "Propuesta";

  const bundle = await createBundle({
    tenantId,
    dealId,
    name: baseName,
    importDealQuotes: false,
    userId,
  });

  const currency = quoteInput?.currency?.trim() || "UF";
  const consumedIds = new Set<string>();
  const quotes: PlanMultiQuoteResult["quotes"] = [];

  for (const { inst, idx } of indicesWithSlots) {
    const installationId = consumeInstallationId(
      params.createdInstallations,
      inst.name,
      consumedIds,
    );
    const nameOverride = `${baseName} — ${inst.name || `Instalación ${idx + 1}`}`;

    try {
      const q = await createPlanQuote({
        tenantId,
        userId,
        dealId,
        accountId,
        contactId,
        installationId,
        threadId,
        proposal,
        quoteInput,
        onlyInstallationIndex: idx,
        nameOverride,
      });

      await linkQuoteToBundle({
        tenantId,
        bundleId: bundle.id,
        quoteId: q.quoteId,
        currency,
        bundleCurrency: currency,
      });

      quotes.push({
        id: q.quoteId,
        code: q.code,
        url: q.quoteUrl,
        installationName: inst.name || `Instalación ${idx + 1}`,
        positionsCreated: q.positionsCreated,
      });
    } catch (err) {
      console.error(
        `[plan-create-quote-multi] quote instalación idx=${idx} (${inst.name}):`,
        err,
      );
    }
  }

  if (quotes.length === 0) {
    throw new Error("No se pudo crear ninguna cotización de la propuesta multi");
  }

  const contractDuration =
    quoteInput?.contractDuration ?? proposal.deal.mesesContrato ?? 12;
  const validUntil = quoteInput?.validUntil
    ? new Date(quoteInput.validUntil)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 90);
        return d;
      })();

  try {
    await prisma.cpqProposalBundle.update({
      where: { id: bundle.id },
      data: {
        currency,
        contractDuration,
        isOngoingService: quoteInput?.isOngoingService ?? true,
        validUntil,
      },
    });
  } catch (err) {
    console.error("[plan-create-quote-multi] update bundle conditions:", err);
  }

  try {
    await createCrmHistoryLog({
      tenantId,
      entityType: "bundle",
      entityId: bundle.id,
      action: "bundle_created",
      details: {
        code: bundle.code,
        source: "correo_plan_acciones",
        quoteCount: quotes.length,
      },
      createdBy: userId,
    });
  } catch (err) {
    console.error("[plan-create-quote-multi] history log:", err);
  }

  const positionsCreated = quotes.reduce((acc, q) => acc + q.positionsCreated, 0);
  const first = quotes[0]!;

  return {
    bundleId: bundle.id,
    bundleCode: bundle.code,
    bundleUrl: `/cpq/quotes/${first.id}`,
    quotes,
    positionsCreated,
  };
}
