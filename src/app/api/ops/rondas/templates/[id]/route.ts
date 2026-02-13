import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaTemplateSchema } from "@/lib/validations/rondas";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const row = await prisma.opsRondaTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        checkpoints: {
          include: { checkpoint: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });
    if (!row) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[RONDAS] GET template", error);
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

    const parsed = await parseBody(request, rondaTemplateSchema.partial().extend({
      checkpointIds: rondaTemplateSchema.shape.checkpointIds.optional(),
    }));
    if (parsed.error) return parsed.error;

    const current = await prisma.opsRondaTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, installationId: true },
    });
    if (!current) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.opsRondaTemplate.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          orderMode: parsed.data.orderMode,
          estimatedDurationMin: parsed.data.estimatedDurationMin,
        },
      });

      if (parsed.data.checkpointIds) {
        await tx.opsRondaCheckpoint.deleteMany({ where: { rondaTemplateId: id, tenantId: ctx.tenantId } });
        await tx.opsRondaCheckpoint.createMany({
          data: parsed.data.checkpointIds.map((checkpointId, idx) => ({
            tenantId: ctx.tenantId,
            rondaTemplateId: id,
            checkpointId,
            orderIndex: idx + 1,
            isRequired: true,
          })),
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] PATCH template", error);
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
    const found = await prisma.opsRondaTemplate.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!found) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    await prisma.opsRondaTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE template", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
