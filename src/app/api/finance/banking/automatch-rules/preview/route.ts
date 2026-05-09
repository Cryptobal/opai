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

const conditionItemSchema = z.object({
  field: z.enum(["DESCRIPTION", "REFERENCE", "AMOUNT", "BENEFICIARY_RUT"]),
  operator: z.enum([
    "CONTAINS",
    "STARTS_WITH",
    "EQUALS",
    "IS_EMPTY",
    "AMOUNT_BETWEEN",
    "AMOUNT_GTE",
    "AMOUNT_LTE",
    "RUT_MATCHES",
  ]),
  value: z
    .union([
      z.string(),
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
      z.null(),
    ])
    .optional(),
});

const previewSchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  appliesTo: z.enum(["DEPOSITS", "WITHDRAWALS", "BOTH"]),
  conditions: z.object({
    mode: z.enum(["ALL", "ANY"]),
    items: z.array(conditionItemSchema).min(1),
  }),
  daysBack: z.number().int().min(1).max(180).optional(),
});

/**
 * POST /api/finance/banking/automatch-rules/preview
 * Cuenta cuántos movimientos en los últimos N días habría matcheado una
 * regla con las conditions dadas. No persiste nada.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const parsed = await parseBody(request, previewSchema);
    if (parsed.error) return parsed.error;
    const result = await previewRuleMatches(
      ctx.tenantId,
      parsed.data.bankAccountId ?? null,
      parsed.data.appliesTo,
      parsed.data.conditions as RuleConditions,
      parsed.data.daysBack ?? 30
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/Rules] preview error:", error);
    const message =
      error instanceof Error ? error.message : "Error al probar regla";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
