import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateGuardiaLifecycleSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsCapability, parseDateOnly } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { lifecycleToLegacyStatus, normalizeNullable } from "@/lib/personas";

type Params = { id: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "rrhh_events");
    if (forbidden) return forbidden;
    const { id } = await params;
    const parsed = await parseBody(request, updateGuardiaLifecycleSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, lifecycleStatus: true, hiredAt: true, terminatedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const effectiveAt = body.effectiveAt ? parseDateOnly(body.effectiveAt) : new Date();
    const terminationReason = normalizeNullable(body.reason);

    const updated = await prisma.$transaction(async (tx) => {
      const guardia = await tx.opsGuardia.update({
        where: { id },
        data: {
          lifecycleStatus: body.lifecycleStatus,
          status: lifecycleToLegacyStatus(body.lifecycleStatus),
          hiredAt:
            body.lifecycleStatus === "contratado" && !existing.hiredAt
              ? effectiveAt
              : body.lifecycleStatus === "contratado"
                ? existing.hiredAt
                : undefined,
          terminatedAt: body.lifecycleStatus === "desvinculado" ? effectiveAt : undefined,
          terminationReason: body.lifecycleStatus === "desvinculado" ? terminationReason : undefined,
        },
        include: {
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      });

      await tx.opsGuardiaHistory.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId: id,
          eventType: "lifecycle_changed",
          previousValue: { lifecycleStatus: existing.lifecycleStatus },
          newValue: { lifecycleStatus: body.lifecycleStatus },
          reason: terminationReason,
          createdBy: ctx.userId,
        },
      });

      return guardia;
    });

    await createOpsAuditLog(ctx, "personas.guardia.lifecycle.updated", "ops_guardia", id, {
      previous: existing.lifecycleStatus,
      next: body.lifecycleStatus,
      reason: terminationReason,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PERSONAS] Error updating lifecycle:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar estado laboral" }, { status: 500 });
  }
}
