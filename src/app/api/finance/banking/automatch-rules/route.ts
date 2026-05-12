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
  listRules,
  createRule,
  type RuleAction,
  type RuleConditions,
} from "@/modules/finance/banking/automatch-rule.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  appliesTo: z.enum(["DEPOSITS", "WITHDRAWALS", "BOTH"]).optional(),
  conditions: z.object({
    mode: z.enum(["ALL", "ANY"]),
    items: z.array(conditionItemSchema).min(1),
  }),
  action: z.object({
    handlingMode: z.enum(["RECOGNIZED", "CATEGORIZED"]),
    accountPlanId: z.string().nullable().optional(),
    supplierId: z.string().nullable().optional(),
    counterpartyRut: z.string().nullable().optional(),
    requiresReview: z.boolean(),
  }),
});

export async function GET(_request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const rules = await listRules(ctx.tenantId);
    return NextResponse.json(
      { success: true, data: rules },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } }
    );
  } catch (error) {
    console.error("[Finance/Banking/Rules] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar reglas" },
      { status: 500 }
    );
  }
}

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
    const parsed = await parseBody(request, createRuleSchema);
    if (parsed.error) return parsed.error;
    const rule = await createRule(ctx.tenantId, ctx.userId, {
      ...parsed.data,
      conditions: parsed.data.conditions as RuleConditions,
      action: parsed.data.action as RuleAction,
    });
    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Banking/Rules] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al crear regla";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
