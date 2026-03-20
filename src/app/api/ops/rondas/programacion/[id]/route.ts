import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaProgramacionSchema } from "@/lib/validations/rondas";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
import { pendingProgramadaEjecucion } from "@/lib/rondas/pending-programada-ejecucion";
import { startOfDayChile } from "@/lib/rondas/timezone";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });

    const row = await prisma.opsRondaProgramacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!row) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[RONDAS] GET programacion by id", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, rondaProgramacionSchema.partial());
    if (parsed.error) return parsed.error;

    const result = await prisma.opsRondaProgramacion.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        diasSemana: parsed.data.diasSemana,
        horaInicio: parsed.data.horaInicio,
        horaFin: parsed.data.horaFin,
        frecuenciaMinutos: parsed.data.frecuenciaMinutos,
        toleranciaMinutos: parsed.data.toleranciaMinutos,
        isActive: parsed.data.isActive,
      },
    });
    if (result.count === 0) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });

    // ── Regenerate scheduled executions with new parameters ──
    // Only delete FUTURE pending ejecuciones. Preserve past/current slots
    // (e.g. overnight shift 22:00→08:00: editing at 02:00 must keep 03:00-07:00 slots).
    const now = new Date();
    const deleted = await prisma.opsRondaEjecucion.deleteMany({
      where: {
        programacionId: id,
        status: "pendiente",
        scheduledAt: { gte: now },
      },
    });

    // Re-fetch the updated programación to get current values
    const updated = await prisma.opsRondaProgramacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rondaTemplate: { include: { checkpoints: true } },
      },
    });

    // Regenerate ejecuciones for today+tomorrow if still active
    if (updated && updated.isActive && updated.rondaTemplate) {
      try {
        // Start from yesterday to capture overnight shifts (e.g. 22:00→08:00)
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const from = startOfDayChile(yesterday);
        const to = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        const slots = buildScheduleSlots({
          from,
          to,
          diasSemana: (updated.diasSemana as number[]) ?? [],
          horaInicio: updated.horaInicio,
          horaFin: updated.horaFin,
          frecuenciaMinutos: updated.frecuenciaMinutos,
        });

        // Only create slots that are in the future
        const futureSlots = slots.filter((s) => s >= now);

        if (futureSlots.length > 0) {
          const rows = futureSlots.map((scheduledAt) =>
            pendingProgramadaEjecucion({
              tenantId: ctx.tenantId,
              rondaTemplateId: updated.rondaTemplateId,
              programacionId: updated.id,
              scheduledAt,
              checkpointsTotal: updated.rondaTemplate!.checkpoints.length,
            }),
          );
          await prisma.opsRondaEjecucion.createMany({ data: rows, skipDuplicates: true });
        }

        console.log(
          `[RONDAS] Programacion ${id} updated: deleted ${deleted.count} pending, regenerated ${futureSlots.length} slots (freq=${updated.frecuenciaMinutos}min)`,
        );
      } catch (genError) {
        console.error(
          `[RONDAS] Regenerate on PATCH failed for programacion ${id} (deleted ${deleted.count} pending):`,
          genError,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] PATCH programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const found = await prisma.opsRondaProgramacion.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!found) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });

    // Clean up future pending ejecuciones before deleting the programación
    await prisma.opsRondaEjecucion.deleteMany({
      where: {
        programacionId: id,
        status: "pendiente",
        scheduledAt: { gte: new Date() },
      },
    });

    await prisma.opsRondaProgramacion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
