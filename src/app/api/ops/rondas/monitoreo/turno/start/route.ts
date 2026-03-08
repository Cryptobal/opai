import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { getCNDate } from "@/lib/rondas/cn-utils";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const existing = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, operatorId: ctx.userId, status: "active" },
    });
    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    // Find tonight's control nocturno to link (if not already linked to another turno)
    const cnDate = getCNDate(new Date());
    const cn = await prisma.opsControlNocturno.findFirst({
      where: {
        tenantId: ctx.tenantId,
        date: cnDate,
        monitoreoTurno: null,
      },
      select: { id: true, shiftStart: true, shiftEnd: true },
    });

    const turno = await prisma.opsMonitoreoTurno.create({
      data: {
        tenantId: ctx.tenantId,
        operatorId: ctx.userId,
        operatorName: ctx.userEmail ?? null,
        status: "active",
        controlNocturnoId: cn?.id ?? null,
      },
    });

    // Generate/update grid slots with rondaExpected flags
    if (cn) {
      try {
        const { generateGridSlots } = await import("@/lib/rondas/generate-grid");
        await generateGridSlots({
          controlNocturnoId: cn.id,
          tenantId: ctx.tenantId,
          shiftStart: cn.shiftStart,
          shiftEnd: cn.shiftEnd,
        });
      } catch (err) {
        console.error("[turno/start] Generate grid slots failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: turno }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST monitoreo turno start", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
