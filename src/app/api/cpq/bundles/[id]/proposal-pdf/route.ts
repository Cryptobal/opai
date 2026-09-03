/**
 * API Route: Descargar PDF consolidado de proposal bundle
 * GET /api/cpq/bundles/[id]/proposal-pdf
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { buildBundleProposalProps } from "@/lib/pdf/templates/proposal/build-bundle-proposal-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { buildContentDisposition } from "@/lib/pdf/cpq-quote-pdf-filename";
import {
  emptyFinalProposalSectionTitles,
  finalProposalIncompleteMessage,
} from "@/lib/pdf/templates/proposal/final-proposal-gate";
import { PROPOSAL_PDF_CACHE_CONTROL } from "@/lib/pdf/templates/proposal/proposal-watermark";

export const runtime = "nodejs";
export const maxDuration = 90;

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
    const bundle = await prisma.cpqProposalBundle.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true, status: true },
    });
    if (!bundle) {
      return NextResponse.json(
        { success: false, error: "Propuesta no encontrada" },
        { status: 404 },
      );
    }

    const included = await prisma.cpqProposalBundleQuote.findMany({
      where: { bundleId: id, tenantId: ctx.tenantId, includedInProposal: true },
      select: { quote: { select: { proposalMode: true, code: true } } },
    });
    if (included.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay cotizaciones incluidas para generar el PDF",
        },
        { status: 400 },
      );
    }
    const licitacion = included.find((row) => row.quote.proposalMode === "licitacion");
    if (licitacion) {
      return NextResponse.json(
        {
          success: false,
          error: `El modo licitación no está disponible en bundles. Generá el PDF desde la cotización ${licitacion.quote.code ?? ""}.`,
        },
        { status: 422 },
      );
    }

    const modeParam = (_request.nextUrl.searchParams.get("mode") ?? "").toLowerCase();
    const pdfMode: "draft" | "final" =
      modeParam === "final"
        ? "final"
        : modeParam === "draft"
          ? "draft"
          : bundle.status === "sent"
            ? "final"
            : "draft";

    const { fileName, ...props } = await buildBundleProposalProps(
      id,
      ctx.tenantId,
      { pdfMode },
    );

    if (pdfMode === "final") {
      const empty = emptyFinalProposalSectionTitles(props.proposalSections);
      if (empty.length > 0) {
        return NextResponse.json(
          { success: false, error: finalProposalIncompleteMessage(empty) },
          { status: 422 },
        );
      }
    }

    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName, "inline"),
        "Cache-Control": PROPOSAL_PDF_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("[Bundle Proposal PDF]", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "BUNDLE_EMPTY") {
      return NextResponse.json(
        { success: false, error: "No hay cotizaciones incluidas" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: `Error al generar PDF: ${msg}` },
      { status: 500 },
    );
  }
}
