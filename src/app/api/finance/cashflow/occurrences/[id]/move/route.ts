import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { moveOccurrence } from "@/modules/finance/cashflow/occurrence.service";

const moveSchema = z.object({
  newDate: z.coerce.date(),
});

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
    await moveOccurrence(ctx.tenantId, id, parsed.data.newDate);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST occurrences/move:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
