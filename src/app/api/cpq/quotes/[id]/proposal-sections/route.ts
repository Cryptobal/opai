/**
 * GET/PATCH /api/cpq/quotes/[id]/proposal-sections
 * Editor por secciones de propuesta v2 (misma fuente de verdad que el chat).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqView } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import {
  loadQuoteProposal,
  saveQuoteProposal,
  ProposalConflictError,
} from "@/lib/cpq/proposal-sections/persist";
import {
  addSection,
  approveSection,
  mergeSections,
  moveToExclusiones,
  ProposalIndexError,
  removeSection,
  renameSection,
  reorderSections,
  setProposalDocStatus,
  setSectionContent,
  unapproveSection,
} from "@/lib/cpq/proposal-sections/ops";
import { validateProposalContent } from "@/lib/cpq/proposal-sections/validate";
import { generateProposalSection } from "@/lib/cpq/proposal-sections/generate-section";
import { deriveComplianceMatrix } from "@/lib/cpq/proposal-sections/compliance-matrix";
import {
  buildLicitacionCorpus,
  licitacionGenerationGate,
} from "@/modules/crm/documents/licitacion-ingest.service";
import type { ProposalContentV2, ProposalDocStatus } from "@/lib/cpq/proposal-sections/schema";
import { emptyProposalV2, PROPOSAL_STATUSES } from "@/lib/cpq/proposal-sections/schema";
import { needsManualConvertToLicitacion } from "@/lib/cpq/proposal-sections/mode";

export const maxDuration = 60;

async function validationCtx(tenantId: string, quote: { dealId: string | null; totalGuards: number; totalPositions: number }) {
  let fechaEntrega: string | null = null;
  if (quote.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: quote.dealId, tenantId },
      select: { fechaEntrega: true },
    });
    fechaEntrega = deal?.fechaEntrega ? deal.fechaEntrega.toISOString().slice(0, 10) : null;
  }
  return {
    hasDotacion: quote.totalGuards > 0 || quote.totalPositions > 0,
    fechaEntrega,
    fechaCierreBases: null as string | null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const { quote, content, dealIsLicitacion } = await loadQuoteProposal({ tenantId: ctx.tenantId, quoteId: id });
    const vCtx = await validationCtx(ctx.tenantId, quote);
    const validations = validateProposalContent(content, vCtx);
    let gate: string | null = null;
    if (content.mode === "licitacion" && quote.dealId) {
      const corpus = await buildLicitacionCorpus(ctx.tenantId, quote.dealId);
      gate = licitacionGenerationGate(corpus.hasBases, corpus.basesError);
    }

    return NextResponse.json({
      success: true,
      data: {
        content,
        validations,
        gate,
        needsConversion: needsManualConvertToLicitacion({ dealIsLicitacion, content }),
        matrix: deriveComplianceMatrix(content),
        quote: {
          id: quote.id,
          code: quote.code,
          dealId: quote.dealId,
          proposalStatus: quote.proposalStatus,
          proposalMode: quote.proposalMode,
          updatedAt: quote.updatedAt.toISOString(),
        },
        canEdit: true,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }
    console.error("[proposal-sections GET]", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar la propuesta" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;
    const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";

    const { quote, content } = await loadQuoteProposal({ tenantId: ctx.tenantId, quoteId: id });
    let next: ProposalContentV2 = content;

    if (action === "set_content") {
      next = setSectionContent(next, sectionId, typeof body.content === "string" ? body.content : "");
    } else if (action === "rename") {
      next = renameSection(next, sectionId, typeof body.title === "string" ? body.title : "");
    } else if (action === "add") {
      next = addSection(next, {
        title: typeof body.title === "string" ? body.title : "",
        content: typeof body.content === "string" ? body.content : "",
        afterId: typeof body.afterId === "string" ? body.afterId : undefined,
      });
    } else if (action === "remove") {
      next = removeSection(next, sectionId);
    } else if (action === "merge") {
      const ids = Array.isArray(body.mergeIds) ? body.mergeIds.filter((x): x is string => typeof x === "string") : [];
      if (ids.length !== 2) {
        return NextResponse.json({ success: false, error: "mergeIds debe tener 2 ids" }, { status: 400 });
      }
      next = mergeSections(next, ids[0]!, ids[1]!);
    } else if (action === "reorder") {
      const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === "string") : [];
      next = reorderSections(next, order);
    } else if (action === "move_exclusiones") {
      next = moveToExclusiones(next, sectionId);
    } else if (action === "approve") {
      next = approveSection(next, sectionId);
    } else if (action === "unapprove") {
      next = unapproveSection(next, sectionId);
    } else if (action === "approve_all") {
      for (const s of next.sections) {
        next = approveSection(next, s.id);
      }
    } else if (action === "set_status") {
      const status = typeof body.status === "string" ? body.status : "";
      if (!(PROPOSAL_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: "Estado inválido" }, { status: 400 });
      }
      next = setProposalDocStatus(next, status as ProposalDocStatus, { userId: ctx.userId });
    } else if (action === "regenerate") {
      if (content.mode === "licitacion") {
        if (!quote.dealId) {
          return NextResponse.json(
            { success: false, error: "La cotización no tiene negocio. Vincúlala antes de generar." },
            { status: 400 },
          );
        }
        const corpus = await buildLicitacionCorpus(ctx.tenantId, quote.dealId);
        const gate = licitacionGenerationGate(corpus.hasBases, corpus.basesError);
        if (gate) {
          return NextResponse.json({ success: false, error: gate }, { status: 422 });
        }
        const section = next.sections.find((s) => s.id === sectionId);
        if (!section) {
          return NextResponse.json({ success: false, error: "Sección no encontrada" }, { status: 404 });
        }
        const generated = await generateProposalSection({
          tenantId: ctx.tenantId,
          section,
          instruction: typeof body.instruction === "string" ? body.instruction : undefined,
          corpus,
          cpq: {
            code: quote.code,
            name: quote.name,
            clientName: quote.clientName,
            staffingSummary: `${quote.totalGuards} guardias / ${quote.totalPositions} puestos`,
          },
          mode: "licitacion",
        });
        next = setSectionContent(next, sectionId, generated.content, {
          sources: generated.sources,
          mark: generated.fallback ? undefined : "ia",
        });
      } else {
        const section = next.sections.find((s) => s.id === sectionId);
        if (!section) {
          return NextResponse.json({ success: false, error: "Sección no encontrada" }, { status: 404 });
        }
        const generated = await generateProposalSection({
          tenantId: ctx.tenantId,
          section,
          instruction: typeof body.instruction === "string" ? body.instruction : undefined,
          corpus: null,
          cpq: { code: quote.code, name: quote.name, clientName: quote.clientName },
          mode: content.mode,
        });
        next = setSectionContent(next, sectionId, generated.content, {
          sources: generated.sources,
          mark: generated.fallback ? undefined : "ia",
        });
      }
    } else if (action === "convert_to_licitacion") {
      next = emptyProposalV2("licitacion", { legacyV1: content.legacyV1 ?? content });
    } else {
      return NextResponse.json({ success: false, error: "Acción no reconocida" }, { status: 400 });
    }

    const saved = await saveQuoteProposal({
      tenantId: ctx.tenantId,
      quoteId: id,
      content: next,
      expectedUpdatedAt,
    });
    const vCtx = await validationCtx(ctx.tenantId, quote);
    return NextResponse.json({
      success: true,
      data: {
        content: saved,
        validations: validateProposalContent(saved, vCtx),
        matrix: deriveComplianceMatrix(saved),
      },
    });
  } catch (error) {
    if (error instanceof ProposalConflictError) {
      return NextResponse.json({ success: false, error: error.message, code: "conflict" }, { status: 409 });
    }
    if (error instanceof ProposalIndexError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }
    console.error("[proposal-sections PATCH]", error);
    return NextResponse.json({ success: false, error: "No se pudo guardar la propuesta" }, { status: 500 });
  }
}
