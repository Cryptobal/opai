import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaTemplateSchema } from "@/lib/validations/rondas";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

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
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

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

    // Validate all checkpoints belong to this template's installation
    if (parsed.data.checkpointIds) {
      const validCheckpoints = await prisma.opsCheckpoint.findMany({
        where: {
          id: { in: parsed.data.checkpointIds },
          tenantId: ctx.tenantId,
          installationId: current.installationId,
        },
        select: { id: true },
      });
      const validIds = new Set(validCheckpoints.map((c) => c.id));
      const invalidIds = parsed.data.checkpointIds.filter((cpId) => !validIds.has(cpId));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { success: false, error: `Checkpoints no pertenecen a la instalación: ${invalidIds.join(", ")}` },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const updResult = await tx.opsRondaTemplate.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          orderMode: parsed.data.orderMode,
          estimatedDurationMin: parsed.data.estimatedDurationMin,
        },
      });
      if (updResult.count === 0) {
        throw new Error("TEMPLATE_NOT_FOUND");
      }

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
    if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }
    console.error("[RONDAS] PATCH template", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

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
