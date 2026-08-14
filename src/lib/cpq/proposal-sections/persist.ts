/**
 * Persistencia de ProposalContentV2 en CpqQuote.proposalAiContent.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  emptyProposalV2,
  readProposalContent,
  type ProposalContentV2,
  type ProposalMode,
} from "./schema";
import {
  resolveProposalMode,
  shouldAutoConvertComercialToLicitacion,
} from "./mode";

export class ProposalConflictError extends Error {
  constructor() {
    super("La propuesta cambió en otro lugar. Recarga e intenta de nuevo.");
    this.name = "ProposalConflictError";
  }
}

export async function loadQuoteProposal(opts: {
  tenantId: string;
  quoteId: string;
  preferredMode?: ProposalMode;
}): Promise<{
  quote: {
    id: string;
    code: string;
    name: string | null;
    clientName: string | null;
    dealId: string | null;
    proposalStatus: string | null;
    proposalMode: string | null;
    proposalAiContent: unknown;
    updatedAt: Date;
    totalGuards: number;
    totalPositions: number;
  };
  content: ProposalContentV2;
  dealIsLicitacion: boolean;
}> {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: opts.quoteId, tenantId: opts.tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      dealId: true,
      proposalStatus: true,
      proposalMode: true,
      proposalAiContent: true,
      updatedAt: true,
      totalGuards: true,
      totalPositions: true,
    },
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");

  let dealIsLicitacion = false;
  if (quote.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: quote.dealId, tenantId: opts.tenantId },
      select: { isLicitacion: true },
    });
    dealIsLicitacion = Boolean(deal?.isLicitacion);
  }

  const mode = resolveProposalMode({
    quoteMode: quote.proposalMode,
    preferredMode: opts.preferredMode,
    dealIsLicitacion,
  });
  let content = readProposalContent(quote.proposalAiContent, mode);
  if (!quote.proposalMode) content.mode = mode;
  if (quote.proposalStatus === "borrador" || quote.proposalStatus === "en_revision" || quote.proposalStatus === "aprobada" || quote.proposalStatus === "enviada") {
    content.status = quote.proposalStatus;
  }

  if (shouldAutoConvertComercialToLicitacion({ dealIsLicitacion, content })) {
    content = emptyProposalV2("licitacion", { legacyV1: content.legacyV1 });
    content = await saveQuoteProposal({
      tenantId: opts.tenantId,
      quoteId: opts.quoteId,
      content,
    });
    quote.proposalMode = "licitacion";
    quote.proposalStatus = content.status;
  } else if (!quote.proposalMode) {
    content = await saveQuoteProposal({
      tenantId: opts.tenantId,
      quoteId: opts.quoteId,
      content,
    });
    quote.proposalMode = content.mode;
    quote.proposalStatus = content.status;
  }

  return { quote, content, dealIsLicitacion };
}

export async function saveQuoteProposal(opts: {
  tenantId: string;
  quoteId: string;
  content: ProposalContentV2;
  expectedUpdatedAt?: string | null;
}): Promise<ProposalContentV2> {
  const current = await prisma.cpqQuote.findFirst({
    where: { id: opts.quoteId, tenantId: opts.tenantId },
    select: { proposalAiContent: true, proposalMode: true },
  });
  if (!current) throw new Error("QUOTE_NOT_FOUND");
  if (opts.expectedUpdatedAt) {
    const existing = readProposalContent(
      current.proposalAiContent,
      (current.proposalMode as ProposalMode) || opts.content.mode,
    );
    if (existing.updatedAt && existing.updatedAt !== opts.expectedUpdatedAt) {
      throw new ProposalConflictError();
    }
  }
  const content: ProposalContentV2 = {
    ...opts.content,
    updatedAt: new Date().toISOString(),
  };
  await prisma.cpqQuote.updateMany({
    where: { id: opts.quoteId, tenantId: opts.tenantId },
    data: {
      proposalAiContent: content as unknown as Prisma.InputJsonValue,
      proposalMode: content.mode,
      proposalStatus: content.status,
      proposalAiGeneratedAt: new Date(),
    },
  });
  return content;
}
