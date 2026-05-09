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
  getRule,
  updateRule,
  deleteRule,
  type RuleAction,
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

const updateRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(9999).optional(),
    appliesTo: z.enum(["DEPOSITS", "WITHDRAWALS", "BOTH"]).optional(),
    conditions: z
      .object({
        mode: z.enum(["ALL", "ANY"]),
        items: z.array(conditionItemSchema).min(1),
      })
      .optional(),
    action: z
      .object({
        handlingMode: z.enum(["RECOGNIZED", "CATEGORIZED"]),
        accountPlanId: z.string().nullable().optional(),
        supplierId: z.string().nullable().optional(),
        counterpartyRut: z.string().nullable().optional(),
        requiresReview: z.boolean(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Sin cambios");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const rule = await getRule(ctx.tenantId, id);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Regla no encontrada" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error("[Finance/Banking/Rules] GET[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener regla" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const parsed = await parseBody(request, updateRuleSchema);
    if (parsed.error) return parsed.error;
    const rule = await updateRule(ctx.tenantId, id, {
      ...parsed.data,
      conditions: parsed.data.conditions as RuleConditions | undefined,
      action: parsed.data.action as RuleAction | undefined,
    });
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error("[Finance/Banking/Rules] PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar regla";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    await deleteRule(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("[Finance/Banking/Rules] DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Error al eliminar regla";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
