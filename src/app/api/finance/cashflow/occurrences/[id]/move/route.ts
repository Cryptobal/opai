import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  moveOccurrence,
  OccurrenceCollisionError,
} from "@/modules/finance/cashflow/occurrence.service";

const moveSchema = z
  .object({
    newDate: z.coerce.date().optional(),
    daysFromCurrent: z.number().int().optional(),
    resolveStrategy: z.enum(["replace", "next_free"]).optional(),
  })
  .refine(
    (v) => v.newDate !== undefined || v.daysFromCurrent !== undefined,
    "Falta newDate o daysFromCurrent",
  );

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = await parseBody(request, moveSchema);
    if (parsed.error) return parsed.error;
    try {
      const result = await moveOccurrence(ctx.tenantId, id, {
        newDate: parsed.data.newDate ?? null,
        daysFromCurrent: parsed.data.daysFromCurrent ?? null,
        resolveStrategy: parsed.data.resolveStrategy,
      });
      return NextResponse.json({
        success: true,
        overwrote: result?.overwrote ?? null,
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
    console.error("[Finance/Cashflow] POST occurrences/move:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
