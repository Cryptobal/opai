import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { applyDefaultQuoteIncludes } from "@/lib/cpq/apply-default-quote-includes";
import { nextDocumentCode } from "@/lib/cpq/document-counter";
import { materializeCoverageSlotsOnQuote } from "@/lib/crm/coverage-slots-to-quote-positions";
import type { CrmStructureProposal, PlanQuoteInput } from "./email-to-crm-structure.types";

function coverageServiceDetail(
  proposal: CrmStructureProposal,
  onlyInstallationIndex?: number,
): string {
  const lines: string[] = [];
  const installations =
    typeof onlyInstallationIndex === "number"
      ? (() => {
          const inst = proposal.installations[onlyInstallationIndex];
          return inst ? [inst] : [];
        })()
      : proposal.installations;

  for (const inst of installations) {
    for (const s of inst.coverageSlots) {
      lines.push(
        `${inst.name} · ${s.name}: cob. ${s.simultaneous} ${s.horaInicio}-${s.horaFin} → dot. ${s.headcount}`,
      );
    }
  }

  if (typeof onlyInstallationIndex === "number") {
    const inst = proposal.installations[onlyInstallationIndex];
    const weeklyHH = Math.round(
      (inst?.coverageSlots.reduce((acc, s) => acc + (s.weeklyHH || 0), 0) ?? 0) * 10,
    ) / 10;
    const headcount = inst?.coverageSlots.reduce((acc, s) => acc + (s.headcount || 0), 0) ?? 0;
    lines.push(`Totales instalación: ${headcount} dot. · ${weeklyHH} HH/sem`);
  } else {
    const t = proposal.staffingTotals;
    lines.push(
      `Totales: ${t.headcountBase} base + ${t.reserveHeadcount} reserva = ${t.headcountWithReserve} · ${t.weeklyHH} HH/sem`,
    );
  }
  return lines.join("\n").slice(0, 4000);
}

/** Crea CpqQuote draft (+ CrmDealQuote si hay deal) + puestos desde cobertura. Errores se propagan al caller (skipped). */
export async function createPlanQuote(params: {
  tenantId: string;
  userId: string;
  /** Opcional: cotización borrador puede vivir solo en la cuenta. */
  dealId?: string | null;
  accountId: string;
  contactId?: string;
  installationId?: string;
  /** Si se indica, crea CrmEmailThreadLink quote↔hilo (linkedVia ai). */
  threadId?: string;
  proposal: CrmStructureProposal;
  quoteInput?: PlanQuoteInput;
  /** Materializa solo los slots de esta instalación (índice en proposal.installations). */
  onlyInstallationIndex?: number;
  /** Sobrescribe el nombre de la cotización (p. ej. multi: "base — Instalación"). */
  nameOverride?: string;
}): Promise<{ quoteId: string; quoteUrl: string; code: string; positionsCreated: number }> {
  const { tenantId, userId, accountId } = params;
  const dealId = params.dealId?.trim() || null;

  let dealTitle: string | null = null;
  if (dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true, title: true },
    });
    if (!deal) throw new Error("Negocio no encontrado para cotización");
    dealTitle = deal.title;
  }

  const input = params.quoteInput;
  const name =
    params.nameOverride?.trim() ||
    input?.name?.trim() ||
    params.proposal.deal.title?.trim() ||
    dealTitle ||
    params.proposal.account.name ||
    "Cotización borrador";
  const contractDuration =
    input?.contractDuration ?? params.proposal.deal.mesesContrato ?? 12;
  const currency = input?.currency?.trim() || "UF";
  const validUntil = input?.validUntil
    ? new Date(input.validUntil)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 90);
        return d;
      })();
  const serviceDetail = coverageServiceDetail(
    params.proposal,
    params.onlyInstallationIndex,
  );

  const quote = await prisma.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, tenantId, "quote");
    return tx.cpqQuote.create({
      data: {
        tenantId,
        code,
        name,
        status: "draft",
        clientName: params.proposal.account.name,
        validUntil,
        insurancePolicyUF: 1500,
        accountId,
        ...(dealId ? { dealId } : {}),
        ...(params.contactId ? { contactId: params.contactId } : {}),
        ...(params.installationId ? { installationId: params.installationId } : {}),
        contractDuration,
        isOngoingService: input?.isOngoingService ?? true,
        currency,
        serviceDetail,
        ...(input?.proposalTemplateId
          ? { proposalTemplateId: input.proposalTemplateId }
          : {}),
      },
      select: { id: true, code: true },
    });
  });

  await createCrmHistoryLog({
    tenantId,
    entityType: "quote",
    entityId: quote.id,
    action: "quote_created",
    details: { code: quote.code, source: "correo_plan_acciones" },
    createdBy: userId,
  });

  try {
    await applyDefaultQuoteIncludes(prisma, quote.id, tenantId);
  } catch (err) {
    console.error("[plan-create-quote] includes:", err);
  }

  if (dealId) {
    try {
      await prisma.crmDealQuote.create({
        data: { tenantId, dealId, quoteId: quote.id },
      });
    } catch (linkErr: unknown) {
      const code =
        linkErr && typeof linkErr === "object" && "code" in linkErr
          ? (linkErr as { code: string }).code
          : "";
      if (code !== "P2002") throw linkErr;
    }
  }

  let positionsCreated = 0;
  try {
    const mat = await materializeCoverageSlotsOnQuote({
      tenantId,
      quoteId: quote.id,
      proposal: params.proposal,
      onlyInstallationIndex: params.onlyInstallationIndex,
    });
    positionsCreated = mat.positionsCreated;
  } catch (err) {
    console.error("[plan-create-quote] materialize positions:", err);
  }

  if (params.threadId) {
    try {
      await prisma.crmEmailThreadLink.upsert({
        where: {
          threadId_entityType_entityId: {
            threadId: params.threadId,
            entityType: "quote",
            entityId: quote.id,
          },
        },
        create: {
          tenantId,
          threadId: params.threadId,
          entityType: "quote",
          entityId: quote.id,
          linkedVia: "ai",
          createdBy: userId,
        },
        update: {},
      });
    } catch (err) {
      console.error("[plan-create-quote] thread link quote:", err);
    }
  }

  return {
    quoteId: quote.id,
    quoteUrl: `/cpq/quotes/${quote.id}`,
    code: quote.code,
    positionsCreated,
  };
}
