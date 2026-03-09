import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { generateGridSlots } from "@/lib/rondas/generate-grid";

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
          include: { checkpoint: { select: { name: true } } },
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        alertasRows: {
          where: { resuelta: false },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        incidentes: {
          select: { id: true, tipo: true, descripcion: true, fotoUrl: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    });

    // If there's an active turno linked to a CN, include CN data for the grid
    let controlNocturno = null;
    const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: { id: true, controlNocturnoId: true, operatorId: true, operatorName: true },
    });

    if (activeTurno?.controlNocturnoId) {
      controlNocturno = await prisma.opsControlNocturno.findUnique({
        where: { id: activeTurno.controlNocturnoId },
        include: {
          instalaciones: {
            orderBy: { orderIndex: "asc" },
            include: {
              guardias: { orderBy: { guardiaNombre: "asc" } },
              rondas: { orderBy: { rondaNumber: "asc" } },
              installation: {
                select: { id: true, name: true, lat: true, lng: true },
              },
            },
          },
        },
      });

      // Safety net: if any installation has 0 rondas, regenerate grid slots
      if (controlNocturno?.instalaciones.some((inst) => inst.rondas.length === 0)) {
        try {
          await generateGridSlots({
            controlNocturnoId: activeTurno.controlNocturnoId,
            tenantId: ctx.tenantId,
            shiftStart: controlNocturno.shiftStart,
            shiftEnd: controlNocturno.shiftEnd,
          });
          // Re-fetch with the newly generated slots
          controlNocturno = await prisma.opsControlNocturno.findUnique({
            where: { id: activeTurno.controlNocturnoId },
            include: {
              instalaciones: {
                orderBy: { orderIndex: "asc" },
                include: {
                  guardias: { orderBy: { guardiaNombre: "asc" } },
                  rondas: { orderBy: { rondaNumber: "asc" } },
                  installation: {
                    select: { id: true, name: true, lat: true, lng: true },
                  },
                },
              },
            },
          });
        } catch (err) {
          console.error("[RONDAS] regenerate grid slots:", err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: active,
      controlNocturno,
      activeTurno: activeTurno ? { id: activeTurno.id, operatorId: activeTurno.operatorId, operatorName: activeTurno.operatorName } : null,
    });
  } catch (error) {
    console.error("[RONDAS] monitoreo", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
