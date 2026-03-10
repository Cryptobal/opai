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
          select: {
            id: true,
            timestamp: true,
            status: true,
            lat: true,
            lng: true,
            geoValidada: true,
            geoDistanciaM: true,
            fotoEvidenciaUrl: true,
            checkpointId: true,
            verificationMethod: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        alertasRows: {
          where: { resuelta: false, archivedAt: null },
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
      select: { id: true, controlNocturnoId: true, operatorId: true, operatorName: true, startedAt: true },
    });

    // Self-heal: if active turno has no CN link, try to find/create one
    if (activeTurno && !activeTurno.controlNocturnoId) {
      try {
        const { getCNDate } = await import("@/lib/rondas/cn-utils");
        const cnDate = getCNDate(new Date());

        // Try unlinked CN first
        let healCN: { id: string } | null = await prisma.opsControlNocturno.findFirst({
          where: { tenantId: ctx.tenantId, date: cnDate, monitoreoTurno: null },
          select: { id: true },
        });

        // Try CN linked to a completed turno
        if (!healCN) {
          const linkedCN = await prisma.opsControlNocturno.findFirst({
            where: { tenantId: ctx.tenantId, date: cnDate, monitoreoTurno: { status: "completed" } },
            select: { id: true, monitoreoTurno: { select: { id: true } } },
          });
          if (linkedCN?.monitoreoTurno) {
            await prisma.opsMonitoreoTurno.update({
              where: { id: linkedCN.monitoreoTurno.id },
              data: { controlNocturnoId: null },
            });
            healCN = { id: linkedCN.id };
          }
        }

        // Auto-create CN if none exists for today
        if (!healCN) {
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
                centralOperatorName: activeTurno.operatorName ?? "Operador",
                shiftStart: "19:00",
                shiftEnd: "08:00",
                status: "borrador",
                createdBy: activeTurno.operatorId,
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
              select: { id: true },
            });
            healCN = newCN;
          }
        }

        if (healCN) {
          await prisma.opsMonitoreoTurno.update({
            where: { id: activeTurno.id },
            data: { controlNocturnoId: healCN.id },
          });
          activeTurno.controlNocturnoId = healCN.id;

          // Generate grid slots for the newly linked CN
          await generateGridSlots({
            controlNocturnoId: healCN.id,
            tenantId: ctx.tenantId,
            shiftStart: "19:00",
            shiftEnd: "08:00",
          });
        }
      } catch (healErr) {
        console.error("[RONDAS] self-heal failed:", healErr);
        // Don't break the main response — continue without CN
      }
    }

    if (activeTurno?.controlNocturnoId) {
      controlNocturno = await prisma.opsControlNocturno.findUnique({
        where: { id: activeTurno.controlNocturnoId },
        include: {
          instalaciones: {
            where: { installation: { nocturnoEnabled: true } },
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

      // Safety net: if any installation has 0 rondas, regenerate grid slots (one-time heal)
      // Note: guards are only populated on turno start, not during polling
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
                where: { installation: { nocturnoEnabled: true } },
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
      activeTurno: activeTurno ? { id: activeTurno.id, operatorId: activeTurno.operatorId, operatorName: activeTurno.operatorName, startedAt: activeTurno.startedAt } : null,
    });
  } catch (error) {
    console.error("[RONDAS] monitoreo", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
