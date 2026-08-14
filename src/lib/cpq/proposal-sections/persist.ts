/**
 * Persistencia de ProposalContentV2 en CpqQuote.proposalAiContent.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  readProposalContent,
  type ProposalContentV2,
  type ProposalMode,
} from "./schema";

export class ProposalConflictError extends Error {
  constructor() {
    super("La propuesta cambió en otro lugar. Recargá e intentá de nuevo.");
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
  const mode: ProposalMode =
    (quote.proposalMode === "licitacion" || quote.proposalMode === "comercial"
      ? quote.proposalMode
      : opts.preferredMode) ?? "comercial";
  const content = readProposalContent(quote.proposalAiContent, mode);
  if (!quote.proposalMode) content.mode = mode;
  if (quote.proposalStatus === "borrador" || quote.proposalStatus === "en_revision" || quote.proposalStatus === "aprobada" || quote.proposalStatus === "enviada") {
    content.status = quote.proposalStatus;
  }
  return { quote, content };
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
