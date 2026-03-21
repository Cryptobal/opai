import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the quote belongs to the user's account
    const quote = await prisma.cpqQuote.findFirst({
      where: {
        id,
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...cpqQuoteListedInClientPortalWhere(),
      },
      select: { id: true, code: true },
    });

    if (!quote) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    const { fileName, ...props } = await buildQuotationProps(id, session.tenantId);
    const pdfBuffer = await renderQuotationToBuffer(props);

    // Log download for heat score / activity tracking
    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: session.tenantId,
          portalType: "cliente",
          userType: "contact",
          userId: session.contactId,
          accountId: session.accountId,
          action: "download_quote",
          resource: id,
        },
      });
    } catch (e) {
      console.warn("[Portal] download_quote log failed:", (e as Error)?.message);
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] Error generating quote PDF:", error);
    return NextResponse.json(
      { error: "Error al generar PDF" },
      { status: 500 }
    );
  }
}
