import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/* ── PATCH /api/ops/ticket-types/batch ───────────────────────────
 * Aplica un mismo cambio a N tipos de ticket del tenant en una sola llamada.
 * Reusa la validación tenant-scoped del endpoint [id]. Campos soportados:
 *   - defaultPriority: "p1" | "p2" | "p3" | "p4"
 *   - defaultAssignedToUserId: <adminId activo del tenant> | null
 *   - approvalSteps: cadena (equipos/usuarios). Non-empty → requiresApproval:true;
 *     [] → requiresApproval:false. (Se puede forzar con requiresApproval.)
 * Body: { ids: string[], patch: {...} }
 * ────────────────────────────────────────────────────────────── */

const VALID_PRIORITIES = ["p1", "p2", "p3", "p4"];

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids)
      ? Array.from(
          new Set(
            (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        )
      : [];
    const patch = (body.patch ?? {}) as Record<string, unknown>;

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "ids requerido" }, { status: 400 });
    }

    // Aislamiento: todos los ids deben pertenecer al tenant.
    const owned = await prisma.opsTicketType.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return NextResponse.json(
        { success: false, error: "Uno o más tipos no pertenecen al tenant" },
        { status: 403 },
      );
    }

    // ── Validar el patch ──
    const scalarData: Record<string, unknown> = {};

    if (patch.defaultPriority !== undefined) {
      if (!VALID_PRIORITIES.includes(patch.defaultPriority as string)) {
        return NextResponse.json({ success: false, error: "Prioridad inválida" }, { status: 400 });
      }
      scalarData.defaultPriority = patch.defaultPriority;
    }

    if (patch.defaultAssignedToUserId !== undefined) {
      const val = patch.defaultAssignedToUserId;
      if (val === null || val === "") {
        scalarData.defaultAssignedToUserId = null;
      } else if (typeof val === "string") {
        const admin = await prisma.admin.findFirst({
          where: { id: val, tenantId: ctx.tenantId, status: "active" },
          select: { id: true },
        });
        if (!admin) {
          return NextResponse.json(
            { success: false, error: "El responsable por defecto no es un admin activo del tenant" },
            { status: 400 },
          );
        }
        scalarData.defaultAssignedToUserId = admin.id;
      } else {
        return NextResponse.json({ success: false, error: "defaultAssignedToUserId inválido" }, { status: 400 });
      }
    }

    const hasChain = Array.isArray(patch.approvalSteps);
    let steps: Array<Record<string, unknown>> = [];
    if (hasChain) {
      const raw = patch.approvalSteps as Array<Record<string, unknown>>;
      steps = raw.map((s, idx) => ({
        stepOrder: typeof s.stepOrder === "number" ? s.stepOrder : idx + 1,
        approverType: s.approverType === "user" ? "user" : "group",
        approverGroupId: (s.approverGroupId as string) ?? null,
        approverUserId: (s.approverUserId as string) ?? null,
        label: (s.label as string) ?? `Paso ${idx + 1}`,
        isRequired: s.isRequired !== false,
      }));
      // Validar que cada paso tenga su referencia.
      for (const s of steps) {
        if (s.approverType === "group" && !s.approverGroupId) {
          return NextResponse.json({ success: false, error: "Un paso de grupo no tiene grupo" }, { status: 400 });
        }
        if (s.approverType === "user" && !s.approverUserId) {
          return NextResponse.json({ success: false, error: "Un paso de usuario no tiene usuario" }, { status: 400 });
        }
      }
      // requiresApproval derivado de la cadena, salvo override explícito.
      scalarData.requiresApproval =
        typeof patch.requiresApproval === "boolean" ? patch.requiresApproval : steps.length > 0;
    } else if (typeof patch.requiresApproval === "boolean") {
      scalarData.requiresApproval = patch.requiresApproval;
    }

    if (Object.keys(scalarData).length === 0 && !hasChain) {
      return NextResponse.json({ success: false, error: "Nada que aplicar" }, { status: 400 });
    }

    // ── Aplicar en una transacción ──
    await prisma.$transaction(async (tx) => {
      if (hasChain) {
        await tx.opsTicketTypeApprovalStep.deleteMany({ where: { ticketTypeId: { in: ids } } });
        if (steps.length > 0) {
          await tx.opsTicketTypeApprovalStep.createMany({
            data: ids.flatMap((ticketTypeId) => steps.map((s) => ({ ...s, ticketTypeId }))) as never,
          });
        }
      }
      if (Object.keys(scalarData).length > 0) {
        await tx.opsTicketType.updateMany({
          where: { id: { in: ids }, tenantId: ctx.tenantId },
          data: scalarData,
        });
      }
    });

    return NextResponse.json({ success: true, data: { updated: ids.length } });
  } catch (error) {
    console.error("[OPS] Error batch-updating ticket types:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo aplicar el cambio masivo" },
      { status: 500 },
    );
  }
}
