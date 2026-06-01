import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { moveDteByOverride } from "@/modules/finance/cashflow/dte-date-override.service";

const moveSchema = z
  .object({
    newDate: z.coerce.date().optional(),
    daysFromCurrent: z.number().int().optional(),
    reason: z.string().optional(),
  })
  .refine(
    (v) => v.newDate !== undefined || v.daysFromCurrent !== undefined,
    "Falta newDate o daysFromCurrent",
  );

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dteId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { dteId } = await context.params;
    const parsed = await parseBody(request, moveSchema);
    if (parsed.error) return parsed.error;
    const result = await moveDteByOverride({
      tenantId: ctx.tenantId,
      dteId,
      createdBy: ctx.userId,
      newDate: parsed.data.newDate ?? null,
      daysFromCurrent: parsed.data.daysFromCurrent ?? null,
      reason: parsed.data.reason ?? null,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST dtes/move:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
