import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { checkpointTaskSchema } from "@/lib/validations/rondas";
import { requireTenantModule } from '@/lib/require-module';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id, taskId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(
      request,
      checkpointTaskSchema.partial().omit({ checkpointId: true }),
    );
    if (parsed.error) return parsed.error;

    const updated = await prisma.opsCheckpointTask.updateMany({
      where: { id: taskId, checkpointId: id, tenantId: ctx.tenantId },
      data: {
        label: parsed.data.label,
        type: parsed.data.type,
        required: parsed.data.required,
        options: parsed.data.options ?? undefined,
        config: parsed.data.config ?? undefined,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const task = await prisma.opsCheckpointTask.findFirst({
      where: { id: taskId, tenantId: ctx.tenantId },
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error("[RONDAS] PATCH checkpoint task", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id, taskId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const deleted = await prisma.opsCheckpointTask.deleteMany({
      where: { id: taskId, checkpointId: id, tenantId: ctx.tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE checkpoint task", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
