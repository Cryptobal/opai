import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getDtePdf } from "@/modules/finance/billing/dte-pdf.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const pdf = await getDtePdf(ctx.tenantId, id);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="dte-${id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error generating PDF:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF" },
      { status: 500 }
    );
  }
}
