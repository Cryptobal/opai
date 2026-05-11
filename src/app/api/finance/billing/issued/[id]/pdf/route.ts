import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getDteProvider } from "@/modules/finance/shared/adapters/dte-provider.adapter";
import { buildDteAttachmentBaseName } from "@/modules/finance/billing/dte-filename";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const dte = await prisma.financeDte.findFirst({
    where: { id, tenantId: ctx.tenantId, direction: "ISSUED" },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 }
    );
  }

  // ?inline=1 → render embebido en <iframe> (Content-Disposition: inline).
  // Sin el query, el default es attachment para forzar descarga.
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const disposition = inline ? "inline" : "attachment";

  try {
    console.log(
      `[Finance/Billing/PDF] Generating PDF for DTE ${dte.code} (tipo ${dte.dteType}, folio ${dte.folio})`,
    );
    const t0 = Date.now();
    const provider = await getDteProvider(ctx.tenantId);
    const pdfBuffer = await provider.getPdf(dte.dteType, dte.folio);
    console.log(
      `[Finance/Billing/PDF] Generated ${pdfBuffer.length} bytes in ${Date.now() - t0}ms`,
    );
    // Filename con folio + cliente + instalación. El navegador prioriza este
    // Content-Disposition sobre el atributo `download` del <a>, por eso se
    // construye acá en el server.
    const filenameBase = await buildDteAttachmentBaseName(ctx.tenantId, dte);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filenameBase}.pdf"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error(
      `[Finance/Billing/PDF] Error generating PDF for DTE ${dte.code}:`,
      err,
    );
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error generando PDF",
      },
      { status: 500 },
    );
  }
}
