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
    // Verificar pertenencia.
    const tpl = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!tpl) {
      return NextResponse.json({ success: false, error: "Plantilla no encontrada" }, { status: 404 });
    }
    const runs = await prisma.financeDteRecurringRun.findMany({
      where: { tenantId: ctx.tenantId, templateId: id },
      orderBy: { ranAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ success: true, data: { runs } });
  } catch (error) {
    console.error("[Finance/Recurring] Runs error:", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
