import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;

    // Verificar que el DTE existe y pertenece al tenant antes de listar logs.
    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!dte) {
      return NextResponse.json({ success: false, error: "DTE no encontrado" }, { status: 404 });
    }

    const logs = await prisma.financeDteEmailLog.findMany({
      where: { tenantId: ctx.tenantId, dteId: id },
      orderBy: { sentAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { logs } });
  } catch (error) {
    console.error("[Finance/Billing/EmailLog] Error:", error);
    return NextResponse.json({ success: false, error: "Error al listar emails" }, { status: 500 });
  }
}
