import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateGuardiaLifecycleSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsCapability, parseDateOnly, toISODate } from "@/lib/ops";
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

    // Contratado requiere effectiveAt: nuevo contrato (!hiredAt) o recontratación (inactivo con finiquito)
    const needsContractDate =
      body.lifecycleStatus === "contratado" &&
      (!existing.hiredAt || (existing.lifecycleStatus === "inactivo" && existing.terminatedAt));
    if (needsContractDate && !body.effectiveAt) {
      return NextResponse.json(
        { success: false, error: "Fecha de inicio de contrato (effectiveAt) es requerida" },
        { status: 400 }
      );
    }

    const effectiveAt = body.effectiveAt ? parseDateOnly(body.effectiveAt) : new Date();
    const terminationReason = normalizeNullable(body.reason);

    const updated = await prisma.$transaction(async (tx) => {
      const isRecontratar = body.lifecycleStatus === "contratado" && existing.lifecycleStatus === "inactivo" && existing.terminatedAt;

      const guardia = await tx.opsGuardia.update({
        where: { id },
        data: {
          lifecycleStatus: body.lifecycleStatus,
          status: lifecycleToLegacyStatus(body.lifecycleStatus),
          hiredAt:
            body.lifecycleStatus === "contratado" && (!existing.hiredAt || isRecontratar)
              ? effectiveAt
              : body.lifecycleStatus === "contratado"
                ? existing.hiredAt
                : undefined,
          terminatedAt: body.lifecycleStatus === "contratado" && isRecontratar ? null : undefined,
          terminationReason: body.lifecycleStatus === "contratado" && isRecontratar ? null : undefined,
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
          newValue: {
            lifecycleStatus: body.lifecycleStatus,
            from: existing.lifecycleStatus,
            to: body.lifecycleStatus,
            effectiveAt: body.effectiveAt ?? undefined,
          },
          reason: terminationReason,
          createdBy: ctx.userId,
        },
      });

      // Log a separate "rehired" event for clear visibility in history
      if (isRecontratar) {
        await tx.opsGuardiaHistory.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: id,
            eventType: "rehired",
            newValue: {
              effectiveAt: body.effectiveAt ?? toISODate(effectiveAt),
            },
            reason: `Recontratación desde ${body.effectiveAt ?? toISODate(effectiveAt)}`,
            createdBy: ctx.userId,
          },
        });
      }

      return guardia;
    });

    await createOpsAuditLog(ctx, "personas.guardia.lifecycle.updated", "ops_guardia", id, {
      previous: existing.lifecycleStatus,
      next: body.lifecycleStatus,
      reason: terminationReason,
    });

    if (body.lifecycleStatus === "inactivo" && existing.lifecycleStatus !== "inactivo") {
      await prisma.notification.updateMany({
        where: {
          tenantId: ctx.tenantId,
          type: { in: ["guardia_doc_expired", "guardia_doc_expiring"] },
          data: { path: ["guardiaId"], equals: id },
          read: false,
        },
        data: { read: true },
      });
    }

    // Trigger onboarding cuando guardia pasa a contratado (activo)
    if (
      body.lifecycleStatus === "contratado" &&
      existing.lifecycleStatus !== "contratado"
    ) {
      after(async () => {
        const { handleGuardActivation } = await import(
          "@/lib/triggers/onboarding-trigger"
        );
        await handleGuardActivation(id, ctx.tenantId);
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PERSONAS] Error updating lifecycle:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar estado laboral" }, { status: 500 });
  }
}
