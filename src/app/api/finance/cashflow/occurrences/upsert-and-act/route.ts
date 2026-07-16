import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  materializeAndAct,
  createManualOccurrence,
  OccurrenceCollisionError,
} from "@/modules/finance/cashflow/occurrence.service";
import { upsertAndActSchema } from "@/lib/validations/cashflow";
import {
  returnRangeField,
  withPartialProjection,
} from "@/modules/finance/cashflow/partial-projection";

const bodySchema = upsertAndActSchema.and(returnRangeField);

/**
 * POST /api/finance/cashflow/occurrences/upsert-and-act
 *
 * Endpoint unificado que cubre el caso "la cuota aún no está materializada en
 * FinanceCashflowOccurrence". Idempotente: si la cuota ya existe, simplemente
 * aplica la acción; si no, la crea con el monto base del item y luego actúa.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    try {
      if (parsed.data.action === "create") {
        const occ = await createManualOccurrence(ctx.tenantId, ctx.userId, {
          kind: parsed.data.kind,
          name: parsed.data.name,
          amountClp: parsed.data.amountClp,
          scheduledDate: parsed.data.scheduledDate,
          categoryId: parsed.data.categoryId ?? null,
          notes: parsed.data.notes ?? null,
        });
        const data = await withPartialProjection(
          ctx.tenantId,
          parsed.data.returnRange,
          { id: occ.id },
        );
        return NextResponse.json({ success: true, data });
      }
      const result = await materializeAndAct(ctx.tenantId, parsed.data);
      const data = await withPartialProjection(
        ctx.tenantId,
        parsed.data.returnRange,
        { id: result.id },
      );
      return NextResponse.json({
        success: true,
        data,
        overwrote: result.overwrote ?? null,
      });
    } catch (e) {
      if (e instanceof OccurrenceCollisionError) {
        return NextResponse.json(
          { success: false, conflict: e.conflict, error: e.message },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST upsert-and-act:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
