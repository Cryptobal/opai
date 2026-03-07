import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
import { resolveOnDutyGuardiaForInstallation } from "@/lib/rondas/guardia-assignment";
import { startOfDayChile } from "@/lib/rondas/timezone";
import { z } from "zod";

const generateSchema = z.object({
  programacionId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const rows = await prisma.opsRondaEjecucion.findMany({
      where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
      include: {
        rondaTemplate: { select: { id: true, name: true, installation: { select: { id: true, name: true } } } },
        guardia: { select: { id: true, code: true, persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[RONDAS] GET ejecuciones", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, generateSchema);
    if (parsed.error) return parsed.error;

    const programacion = await prisma.opsRondaProgramacion.findFirst({
      where: { id: parsed.data.programacionId, tenantId: ctx.tenantId, isActive: true },
      include: {
        rondaTemplate: {
          include: {
            checkpoints: true,
          },
        },
      },
    });
    if (!programacion) {
      return NextResponse.json({ success: false, error: "Programación no encontrada" }, { status: 404 });
    }

    // Default: from start of today (Chile time) to +24h, so all daily slots are generated
    const from = parsed.data.from ? new Date(parsed.data.from) : startOfDayChile(new Date());
    const to = parsed.data.to ? new Date(parsed.data.to) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slots = buildScheduleSlots({
      from,
      to,
      diasSemana: (programacion.diasSemana as number[]) ?? [],
      horaInicio: programacion.horaInicio,
      horaFin: programacion.horaFin,
      frecuenciaMinutos: programacion.frecuenciaMinutos,
    });

    const rows = await Promise.all(
      slots.map(async (slot) => {
        const assignment = await resolveOnDutyGuardiaForInstallation({
          tenantId: ctx.tenantId,
          installationId: programacion.rondaTemplate!.installationId,
          scheduledAt: slot,
        });
        return {
          tenantId: ctx.tenantId,
          rondaTemplateId: programacion.rondaTemplateId,
          programacionId: programacion.id,
          guardiaId: assignment.guardiaId,
          status: "pendiente",
          scheduledAt: slot,
          checkpointsTotal: programacion.rondaTemplate!.checkpoints.length,
          checkpointsCompletados: 0,
          porcentajeCompletado: 0,
          trustScore: 0,
          ...(assignment.guardiaId
            ? {
                alertas: {
                  assignment: {
                    assignedGuardiaId: assignment.guardiaId,
                    source: assignment.source,
                    assignedAt: new Date().toISOString(),
                  },
                } as never,
              }
            : {}),
        };
      }),
    );

    const created = await prisma.opsRondaEjecucion.createMany({ data: rows, skipDuplicates: true });

    // Push: notify assigned guardias of new ronda assignments (portal rondas)
    try {
      const guardiaIds = [...new Set(
        rows
          .map((s) => s.guardiaId)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      )];
      if (guardiaIds.length > 0) {
        const { sendPushToPortalUser } = await import('@/lib/pwa/push-service');
        await Promise.allSettled(
          guardiaIds.map((guardiaId) =>
            sendPushToPortalUser({
              tenantId: ctx.tenantId,
              notifKey: 'ronda_assigned',
              userType: 'guardia',
              userId: guardiaId,
              portalType: 'rondas',
              title: 'Nueva ronda asignada',
              body: 'Tienes una nueva ronda programada para ejecutar',
              url: '/portal/rondas',
            })
          )
        );
      }
    } catch (err) {
      console.error('[RONDAS] Error sending ronda_assigned push:', err);
    }

    return NextResponse.json({ success: true, data: { created: created.count } });
  } catch (error) {
    console.error("[RONDAS] POST ejecuciones", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
