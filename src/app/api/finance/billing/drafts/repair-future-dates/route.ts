import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { repairFutureDraftDates } from "@/modules/finance/billing/repair-future-draft-dates.service";

const schema = z.object({
  dryRun: z.boolean().optional(),
});

/** POST — repara borradores post-fechados por el bug MES_SIGUIENTE→issueDate. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_issue")) {
      return NextResponse.json(
        { success: false, error: "Sin permiso para reparar borradores" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;
    const result = await repairFutureDraftDates({
      tenantId: ctx.tenantId,
      dryRun: parsed.data.dryRun === true,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Billing] repair-future-dates:", error);
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
