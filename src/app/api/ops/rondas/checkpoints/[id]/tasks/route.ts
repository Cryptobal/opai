import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { checkpointTaskSchema } from "@/lib/validations/rondas";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const tasks = await prisma.opsCheckpointTask.findMany({
      where: { checkpointId: id, tenantId: ctx.tenantId },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error("[RONDAS] GET checkpoint tasks", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, checkpointTaskSchema);
    if (parsed.error) return parsed.error;

    // Verify checkpoint belongs to this tenant
    const checkpoint = await prisma.opsCheckpoint.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!checkpoint) {
      return NextResponse.json({ success: false, error: "Checkpoint no encontrado" }, { status: 404 });
    }

    // Auto-assign sortOrder if not provided
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === 0) {
      const maxOrder = await prisma.opsCheckpointTask.aggregate({
        where: { checkpointId: id, tenantId: ctx.tenantId },
        _max: { sortOrder: true },
      });
      sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    }

    const task = await prisma.opsCheckpointTask.create({
      data: {
        tenantId: ctx.tenantId,
        checkpointId: id,
        sortOrder,
        label: parsed.data.label,
        type: parsed.data.type,
        required: parsed.data.required,
        options: parsed.data.options ?? undefined,
        config: parsed.data.config ?? undefined,
        isActive: parsed.data.isActive,
      },
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST checkpoint task", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
