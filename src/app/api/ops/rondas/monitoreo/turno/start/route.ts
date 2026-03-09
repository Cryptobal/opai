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

    // Find tonight's control nocturno to link
    const cnDate = getCNDate(new Date());

    // 1) Try to find an unlinked CN for today
    let cn = await prisma.opsControlNocturno.findFirst({
      where: {
        tenantId: ctx.tenantId,
        date: cnDate,
        monitoreoTurno: null,
      },
      select: { id: true, shiftStart: true, shiftEnd: true },
    });

    // 2) If not found, try to reuse a CN linked to a completed turno
    if (!cn) {
      const linkedCN = await prisma.opsControlNocturno.findFirst({
        where: {
          tenantId: ctx.tenantId,
          date: cnDate,
          monitoreoTurno: { status: "completed" },
        },
        select: { id: true, shiftStart: true, shiftEnd: true, monitoreoTurno: { select: { id: true } } },
      });
      if (linkedCN) {
        // Unlink the completed turno so we can reuse the CN
        await prisma.opsMonitoreoTurno.update({
          where: { id: linkedCN.monitoreoTurno!.id },
          data: { controlNocturnoId: null },
        });
        cn = { id: linkedCN.id, shiftStart: linkedCN.shiftStart, shiftEnd: linkedCN.shiftEnd };
      }
    }

    // 3) If no CN exists at all for today, auto-create one
    if (!cn) {
      const installations = await prisma.crmInstallation.findMany({
        where: { tenantId: ctx.tenantId, isActive: true, nocturnoEnabled: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      if (installations.length > 0) {
        const RONDA_HOURS = [
          "20:00", "21:00", "22:00", "23:00",
          "00:00", "01:00", "02:00", "03:00",
          "04:00", "05:00", "06:00", "07:00",
        ];
        const newCN = await prisma.opsControlNocturno.create({
          data: {
            tenantId: ctx.tenantId,
            date: cnDate,
            centralOperatorName: ctx.userEmail ?? "Operador",
            shiftStart: "19:00",
            shiftEnd: "08:00",
            status: "borrador",
            createdBy: ctx.userId,
            instalaciones: {
              create: installations.map((inst, idx) => ({
                installationId: inst.id,
                installationName: inst.name,
                orderIndex: idx + 1,
                guardiasRequeridos: 1,
                guardiasPresentes: 0,
                statusInstalacion: "normal",
                rondas: {
                  create: RONDA_HOURS.map((hora, rIdx) => ({
                    rondaNumber: rIdx + 1,
                    horaEsperada: hora,
                    status: "pendiente",
                  })),
                },
              })),
            },
          },
          select: { id: true, shiftStart: true, shiftEnd: true },
        });
        cn = newCN;
      }
    }

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
