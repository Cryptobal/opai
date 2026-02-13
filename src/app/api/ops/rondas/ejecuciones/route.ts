import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
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

    const from = parsed.data.from ? new Date(parsed.data.from) : new Date();
    const to = parsed.data.to ? new Date(parsed.data.to) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slots = buildScheduleSlots({
      from,
      to,
      diasSemana: (programacion.diasSemana as number[]) ?? [],
      horaInicio: programacion.horaInicio,
      horaFin: programacion.horaFin,
      frecuenciaMinutos: programacion.frecuenciaMinutos,
    });

    const created = await prisma.opsRondaEjecucion.createMany({
      data: slots.map((slot) => ({
        tenantId: ctx.tenantId,
        rondaTemplateId: programacion.rondaTemplateId,
        programacionId: programacion.id,
        status: "pendiente",
        scheduledAt: slot,
        checkpointsTotal: programacion.rondaTemplate.checkpoints.length,
        checkpointsCompletados: 0,
        porcentajeCompletado: 0,
        trustScore: 0,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, data: { created: created.count } });
  } catch (error) {
    console.error("[RONDAS] POST ejecuciones", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
