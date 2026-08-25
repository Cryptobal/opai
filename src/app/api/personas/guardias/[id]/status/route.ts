import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateGuardiaLifecycleSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsCapability, parseDateOnly, toISODate } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { lifecycleToLegacyStatus, normalizeNullable } from "@/lib/personas";
import { assertGuardLimit, planLimitErrorMessage } from "@/lib/plan-limits";
import {
  CANCEL_HIRE_REASON,
  isAllowedLifecycleTransition,
} from "@/lib/personas-lifecycle";
import {
  applyCancelHireOperationalCleanup,
  cancelHireAsOfDate,
  getCancelHireEligibility,
} from "@/lib/personas-cancel-hire";

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

    if (
      !isAllowedLifecycleTransition(existing.lifecycleStatus, body.lifecycleStatus, {
        reason: body.reason,
      })
    ) {
      const needsFiniquito =
        existing.lifecycleStatus === "contratado" && body.lifecycleStatus === "inactivo";
      return NextResponse.json(
        {
          success: false,
          error: needsFiniquito
            ? "Un guardia contratado solo puede pasar a inactivo por finiquito o anulando la contratación si nunca inició."
            : "Transición de estado no permitida",
        },
        { status: 400 },
      );
    }

    const isCancelHire =
      existing.lifecycleStatus === "contratado" &&
      body.lifecycleStatus === "inactivo" &&
      body.reason === CANCEL_HIRE_REASON;

    if (isCancelHire) {
      const eligibility = await getCancelHireEligibility(
        ctx.tenantId,
        id,
        existing.lifecycleStatus,
      );
      if (!eligibility.eligible) {
        return NextResponse.json(
          { success: false, error: eligibility.reason ?? "No se puede anular la contratación" },
          { status: 409 },
        );
      }
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
    const terminationReason = isCancelHire
      ? CANCEL_HIRE_REASON
      : normalizeNullable(body.reason);
    const cancelHireAsOf = isCancelHire ? cancelHireAsOfDate(body.effectiveAt) : null;

    const becomingActive =
      (body.lifecycleStatus === "contratado" || body.lifecycleStatus === "te") &&
      lifecycleToLegacyStatus(existing.lifecycleStatus) !== "active";
    if (becomingActive) {
      const guardLimit = await assertGuardLimit(ctx.tenantId);
      if (!guardLimit.ok) {
        return NextResponse.json(
          {
            success: false,
            error: planLimitErrorMessage("guardias", guardLimit),
            code: "PLAN_LIMIT_REACHED",
            limit: guardLimit.limit,
            current: guardLimit.current,
          },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const isRecontratar = body.lifecycleStatus === "contratado" && existing.lifecycleStatus === "inactivo" && existing.terminatedAt;
      const writingContract =
        body.lifecycleStatus === "contratado" &&
        (!existing.hiredAt || isRecontratar || body.contractType || body.contractStartDate);

      const contractStart = body.contractStartDate
        ? parseDateOnly(body.contractStartDate)
        : writingContract
          ? effectiveAt
          : undefined;

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
          terminatedAt: isCancelHire
            ? cancelHireAsOf
            : body.lifecycleStatus === "contratado" && isRecontratar
              ? null
              : undefined,
          terminationReason: isCancelHire
            ? CANCEL_HIRE_REASON
            : body.lifecycleStatus === "contratado" && isRecontratar
              ? null
              : undefined,
          ...(writingContract
            ? {
                contractType: body.contractType ?? "indefinido",
                contractStartDate: contractStart ?? null,
                contractPeriod1End:
                  body.contractType === "plazo_fijo" && body.contractPeriod1End
                    ? parseDateOnly(body.contractPeriod1End)
                    : null,
                contractPeriod2End:
                  body.contractType === "plazo_fijo" && body.contractPeriod2End
                    ? parseDateOnly(body.contractPeriod2End)
                    : null,
                contractPeriod3End: null,
                contractCurrentPeriod: 1,
                contractBecameIndefinidoAt: body.contractType === "indefinido" ? contractStart ?? null : null,
              }
            : {}),
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
            ...(isCancelHire ? { cancelHire: true, cancelHireNote: body.cancelHireNote ?? undefined } : {}),
          },
          reason: isCancelHire
            ? [CANCEL_HIRE_REASON, body.cancelHireNote].filter(Boolean).join(": ")
            : terminationReason,
          createdBy: ctx.userId,
        },
      });

      if (isCancelHire && cancelHireAsOf) {
        await applyCancelHireOperationalCleanup(tx, {
          tenantId: ctx.tenantId,
          guardiaId: id,
          asOf: cancelHireAsOf,
        });
      }

      if (isRecontratar) {
        await tx.opsGuardiaHistory.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: id,
            eventType: "rehired",
            newValue: {
              effectiveAt: body.effectiveAt ?? toISODate(effectiveAt),
              contractType: body.contractType ?? "indefinido",
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
