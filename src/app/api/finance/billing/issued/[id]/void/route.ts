import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_void")) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para anular DTEs" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 }
      );
    }

    if (dte.siiStatus === "ANNULLED") {
      return NextResponse.json(
        { success: false, error: "DTE ya anulado" },
        { status: 400 }
      );
    }

    const updated = await prisma.financeDte.update({
      where: { id },
      data: {
        siiStatus: "ANNULLED",
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance/Billing] Error voiding DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al anular DTE" },
      { status: 500 }
    );
  }
}
