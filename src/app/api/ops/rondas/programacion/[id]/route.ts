import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaProgramacionSchema } from "@/lib/validations/rondas";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
import { resolveOnDutyGuardiaForInstallation } from "@/lib/rondas/guardia-assignment";
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
    // Delete future pending ejecuciones (preserves started/completed/etc.)
    await prisma.opsRondaEjecucion.deleteMany({
      where: {
        programacionId: id,
        status: "pendiente",
        scheduledAt: { gte: new Date() },
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
        const now = new Date();
        const from = startOfDayChile(now);
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
          const rows = await Promise.all(
            futureSlots.map(async (scheduledAt) => {
              const assignment = await resolveOnDutyGuardiaForInstallation({
                tenantId: ctx.tenantId,
                installationId: updated.rondaTemplate!.installationId,
                scheduledAt,
              });
              return {
                tenantId: ctx.tenantId,
                rondaTemplateId: updated.rondaTemplateId,
                programacionId: updated.id,
                guardiaId: assignment.guardiaId,
                status: "pendiente",
                scheduledAt,
                checkpointsTotal: updated.rondaTemplate!.checkpoints.length,
                checkpointsCompletados: 0,
                porcentajeCompletado: 0,
                trustScore: 0,
              };
            }),
          );
          await prisma.opsRondaEjecucion.createMany({ data: rows, skipDuplicates: true });
        }
      } catch (genError) {
        console.error("[RONDAS] Regenerate on PATCH failed:", genError);
        // Don't fail the update itself
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
