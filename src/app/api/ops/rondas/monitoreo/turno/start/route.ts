import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { toChileTime } from "@/lib/rondas/timezone";

/**
 * Get the control nocturno "night date" for a given moment.
 * Night shifts run ~19:00-08:00. If it's before 08:00 AM Chile time,
 * the CN date is yesterday (the night started yesterday evening).
 */
function getCNDateForNow(): Date {
  const chileNow = toChileTime(new Date());
  const hour = chileNow.getHours();
  if (hour < 8) {
    chileNow.setDate(chileNow.getDate() - 1);
  }
  chileNow.setHours(0, 0, 0, 0);
  return chileNow;
}

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
    const cnDate = getCNDateForNow();
    const cn = await prisma.opsControlNocturno.findFirst({
      where: {
        tenantId: ctx.tenantId,
        date: cnDate,
        monitoreoTurno: null,
      },
      select: { id: true },
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

    return NextResponse.json({ success: true, data: turno }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST monitoreo turno start", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
