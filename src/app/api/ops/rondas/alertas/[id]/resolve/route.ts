import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

export async function PUT(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const result = await prisma.opsAlertaRonda.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { resuelta: true, resueltaPor: ctx.userId, resueltaAt: new Date() },
    });
    if (!result.count) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }

    const updated = await prisma.opsAlertaRonda.findFirst({ where: { id, tenantId: ctx.tenantId } });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] PUT resolve", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
