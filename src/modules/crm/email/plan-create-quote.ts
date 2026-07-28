import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { applyDefaultQuoteIncludes } from "@/lib/cpq/apply-default-quote-includes";
import { materializeCoverageSlotsOnQuote } from "@/lib/crm/coverage-slots-to-quote-positions";
import type { CrmStructureProposal, PlanQuoteInput } from "./email-to-crm-structure.types";

function coverageServiceDetail(proposal: CrmStructureProposal): string {
  const lines: string[] = [];
  for (const inst of proposal.installations) {
    for (const s of inst.coverageSlots) {
      lines.push(
        `${inst.name} · ${s.name}: cob. ${s.simultaneous} ${s.horaInicio}-${s.horaFin} → dot. ${s.headcount}`,
      );
    }
  }
  const t = proposal.staffingTotals;
  lines.push(
    `Totales: ${t.headcountBase} base + ${t.reserveHeadcount} reserva = ${t.headcountWithReserve} · ${t.weeklyHH} HH/sem`,
  );
  return lines.join("\n").slice(0, 4000);
}

/** Crea CpqQuote draft + CrmDealQuote + puestos desde cobertura. Errores se propagan al caller (skipped). */
export async function createPlanQuote(params: {
  tenantId: string;
  userId: string;
  dealId: string;
  accountId: string;
  contactId?: string;
  installationId?: string;
  proposal: CrmStructureProposal;
  quoteInput?: PlanQuoteInput;
}): Promise<{ quoteId: string; quoteUrl: string; code: string; positionsCreated: number }> {
  const { tenantId, userId, dealId, accountId } = params;
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, title: true },
  });
  if (!deal) throw new Error("Negocio no encontrado para cotización");

  const input = params.quoteInput;
  const name =
    input?.name?.trim() ||
    params.proposal.deal.title?.trim() ||
    deal.title ||
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
  const serviceDetail = coverageServiceDetail(params.proposal);

  const year = new Date().getFullYear();
  let quote: { id: string; code: string } | null = null;
  let attempts = 0;
  while (!quote && attempts < 10) {
    attempts++;
    const count = await prisma.cpqQuote.count({ where: { tenantId } });
    const code = `CPQ-${year}-${String(count + attempts).padStart(3, "0")}`;
    try {
      quote = await prisma.cpqQuote.create({
        data: {
          tenantId,
          code,
          name,
          status: "draft",
          clientName: params.proposal.account.name,
          validUntil,
          insurancePolicyUF: 1500,
          accountId,
          dealId,
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
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : "";
      if (code === "P2002" && attempts < 10) continue;
      throw err;
    }
  }
  if (!quote) throw new Error("No se pudo generar código único de cotización");

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

  let positionsCreated = 0;
  try {
    const mat = await materializeCoverageSlotsOnQuote({
      tenantId,
      quoteId: quote.id,
      proposal: params.proposal,
    });
    positionsCreated = mat.positionsCreated;
  } catch (err) {
    console.error("[plan-create-quote] materialize positions:", err);
  }

  return {
    quoteId: quote.id,
    quoteUrl: `/cpq/quotes/${quote.id}`,
    code: quote.code,
    positionsCreated,
  };
}
