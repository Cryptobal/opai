/**
 * Conversión in-place de una cotización única en propuesta multi-instalación:
 * crea el CpqProposalBundle con la quote como primera hija, heredando datos
 * CRM y copiando condiciones comerciales + gasto financiero al bundle (fuente
 * de verdad a nivel propuesta desde ese momento).
 */

import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { BundleServiceError, generateBundleCode } from "./bundle.service";
import { BUNDLE_CONDITION_FIELDS } from "./propagate-bundle-conditions";

export async function convertQuoteToBundle(opts: {
  tenantId: string;
  quoteId: string;
  userId?: string | null;
}): Promise<{ bundleId: string; code: string; existing: boolean }> {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: opts.quoteId, tenantId: opts.tenantId },
    include: {
      parameters: {
        select: { financialEnabled: true, financialRatePct: true },
      },
      proposalBundleQuote: {
        select: { bundle: { select: { id: true, code: true } } },
      },
    },
  });
  if (!quote) {
    throw new BundleServiceError("Cotización no encontrada", "NOT_FOUND", 404);
  }

  // Ya pertenece a un bundle → abrir en modo multi (idempotente).
  if (quote.proposalBundleQuote) {
    return {
      bundleId: quote.proposalBundleQuote.bundle.id,
      code: quote.proposalBundleQuote.bundle.code,
      existing: true,
    };
  }

  if (!quote.dealId) {
    throw new BundleServiceError(
      "La cotización no tiene negocio asociado. Asocia un negocio en la sección Datos antes de convertirla en propuesta multi-instalación.",
      "VALIDATION",
      422,
    );
  }

  const code = await generateBundleCode(opts.tenantId);

  const conditions: Record<string, unknown> = {};
  for (const field of BUNDLE_CONDITION_FIELDS) {
    conditions[field] = quote[field];
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const created = await tx.cpqProposalBundle.create({
      data: {
        tenantId: opts.tenantId,
        code,
        name: quote.name || quote.clientName || null,
        status: "draft",
        accountId: quote.accountId,
        contactId: quote.contactId,
        dealId: quote.dealId!,
        currency: quote.currency,
        validUntil: quote.validUntil,
        // Condiciones y financiero heredados de la quote: el consolidado nunca
        // parte "vacío" (§15 del brief).
        ...conditions,
        financialEnabled: quote.parameters?.financialEnabled ?? false,
        financialRatePct: quote.parameters?.financialRatePct ?? 2.5,
      },
    });
    await tx.cpqProposalBundleQuote.create({
      data: {
        tenantId: opts.tenantId,
        bundleId: created.id,
        quoteId: quote.id,
        includedInProposal: true,
        displayOrder: 0,
      },
    });
    return created;
  });

  await createCrmHistoryLog({
    tenantId: opts.tenantId,
    entityType: "bundle",
    entityId: bundle.id,
    action: "bundle_created_from_quote",
    details: { code: bundle.code, quoteId: quote.id, quoteCode: quote.code },
    createdBy: opts.userId ?? null,
  });
  await createCrmHistoryLog({
    tenantId: opts.tenantId,
    entityType: "quote",
    entityId: quote.id,
    action: "quote_converted_to_bundle",
    details: { bundleId: bundle.id, bundleCode: bundle.code },
    createdBy: opts.userId ?? null,
  });

  return { bundleId: bundle.id, code: bundle.code, existing: false };
}
