import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  previewRuleMatches,
  type RuleConditions,
} from "@/modules/finance/banking/automatch-rule.service";
import { conditionItemSchema } from "@/modules/finance/banking/automatch-rule-schemas";

const previewSchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  appliesTo: z.enum(["DEPOSITS", "WITHDRAWALS", "BOTH"]),
  conditions: z.object({
    mode: z.enum(["ALL", "ANY"]),
    items: z.array(conditionItemSchema).min(1),
  }),
  /**
   * null/omitido = toda la cartola (default).
   * 30/90/180 = ventana opcional.
   */
  daysBack: z
    .union([z.literal(30), z.literal(90), z.literal(180), z.null()])
    .optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/preview
 * Cuenta cuántos movimientos matchearía una regla. Por defecto recorre
 * toda la cartola (cap 5000). No persiste nada.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(request, previewSchema);
    if (parsed.error) return parsed.error;
    const result = await previewRuleMatches(
      ctx.tenantId,
      parsed.data.bankAccountId ?? null,
      parsed.data.appliesTo,
      parsed.data.conditions as RuleConditions,
      parsed.data.daysBack ?? null,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/Rules] preview error:", error);
    const message =
      error instanceof Error ? error.message : "Error al probar regla";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
