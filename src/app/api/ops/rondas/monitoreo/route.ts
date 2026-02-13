import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const active = await prisma.opsRondaEjecucion.findMany({
      where: { tenantId: ctx.tenantId, status: "en_curso" },
      include: {
        rondaTemplate: {
          include: {
            installation: { select: { id: true, name: true, lat: true, lng: true } },
            checkpoints: {
              include: { checkpoint: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, phoneMobile: true } },
          },
        },
        marcaciones: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json({ success: true, data: active });
  } catch (error) {
    console.error("[RONDAS] monitoreo", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
