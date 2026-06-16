/**
 * API Route: GET /api/portal/cliente/presentation/pdf
 *
 * Genera y entrega (on-demand) la PRESENTACIÓN INSTITUCIONAL de empresa en PDF
 * para que el cliente la descargue desde el portal. Es el mismo template de la
 * Propuesta Técnica (render-proposal) en variante 'institutional': SIN valores
 * comerciales ni características del servicio. Al ser on-demand, siempre refleja
 * los cambios del template.
 *
 * Auth: sesión del portal del cliente (requirePortalClienteAuth).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { buildInstitutionalPresentationProps } from "@/lib/pdf/templates/proposal/build-presentation-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePortalClienteAuth(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const account = await prisma.crmAccount.findFirst({
      where: { id: auth.accountId, tenantId: auth.tenantId },
      select: { name: true, industry: true, segment: true },
    });

    const props = await buildInstitutionalPresentationProps(auth.tenantId, {
      companyName: account?.name || auth.contactName || "Cliente",
      contactName: auth.contactName,
      industry: account?.industry ?? null,
      segment: account?.segment ?? null,
    });

    const pdfBuffer = await renderProposalToBufferFromProps(props);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${props.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[Portal] presentation PDF error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Error al generar la presentación: ${msg}` },
      { status: 500 },
    );
  }
}
