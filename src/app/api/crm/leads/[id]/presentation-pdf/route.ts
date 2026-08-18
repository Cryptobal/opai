/**
 * GET /api/crm/leads/[id]/presentation-pdf
 *
 * Genera la Presentación institucional de empresa en PDF para un lead,
 * para descargar / compartir (WhatsApp) desde móvil sin reenviar el correo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { buildInstitutionalPresentationProps } from "@/lib/pdf/templates/proposal/build-presentation-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { buildContentDisposition } from "@/lib/pdf/cpq-quote-pdf-filename";
import { toSentenceCase } from "@/lib/text-format";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        companyName: true,
        firstName: true,
        lastName: true,
        industry: true,
      },
    });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead no encontrado" },
        { status: 404 },
      );
    }

    const contactName =
      [toSentenceCase(lead.firstName), toSentenceCase(lead.lastName)]
        .filter(Boolean)
        .join(" ")
        .trim() || undefined;
    const companyName =
      toSentenceCase(lead.companyName) || contactName || "Prospecto";

    const { fileName, ...props } = await buildInstitutionalPresentationProps(
      ctx.tenantId,
      {
        companyName,
        contactName,
        industry: lead.industry ?? null,
      },
    );
    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName, "attachment"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[CRM] lead presentation PDF:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Error al generar la presentación: ${msg}` },
      { status: 500 },
    );
  }
}
