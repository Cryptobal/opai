import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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

    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: true },
    });

    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: dte });
  } catch (error) {
    console.error("[Finance/Billing] Error getting DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener DTE" },
      { status: 500 }
    );
  }
}
