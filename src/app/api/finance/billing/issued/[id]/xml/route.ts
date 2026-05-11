import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getDteProvider } from "@/modules/finance/shared/adapters/dte-provider.adapter";
import { buildDteAttachmentBaseName } from "@/modules/finance/billing/dte-filename";

export async function GET(
  _request: NextRequest,
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

  try {
    const provider = await getDteProvider(ctx.tenantId);
    const xmlBuffer = await provider.getXml(dte.dteType, dte.folio);
    const filenameBase = await buildDteAttachmentBaseName(ctx.tenantId, dte);
    return new NextResponse(new Uint8Array(xmlBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${filenameBase}.xml"`,
      },
    });
  } catch (err) {
    console.error("[Finance/Billing] Error downloading XML:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
