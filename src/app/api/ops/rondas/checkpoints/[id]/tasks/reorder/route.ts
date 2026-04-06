import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { checkpointTaskReorderSchema } from "@/lib/validations/rondas";
import { requireTenantModule } from '@/lib/require-module';

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

    const parsed = await parseBody(request, checkpointTaskReorderSchema);
    if (parsed.error) return parsed.error;

    // Update sort orders in a transaction
    await prisma.$transaction(
      parsed.data.taskIds.map((taskId, index) =>
        prisma.opsCheckpointTask.updateMany({
          where: { id: taskId, checkpointId: id, tenantId: ctx.tenantId },
          data: { sortOrder: index },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] POST reorder tasks", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
