import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  listRules,
  createRule,
  type RuleAction,
  type RuleConditions,
} from "@/modules/finance/banking/automatch-rule.service";
import {
  conditionItemSchema,
  isFlowRowActionBody,
  ruleActionSchema,
} from "@/modules/finance/banking/automatch-rule-schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  appliesTo: z.enum(["DEPOSITS", "WITHDRAWALS", "BOTH"]).optional(),
  conditions: z.object({
    mode: z.enum(["ALL", "ANY"]),
    items: z.array(conditionItemSchema).min(1),
  }),
  action: ruleActionSchema,
});

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const enabledFilter = searchParams.get("enabled");
    const countOnly = searchParams.get("countOnly") === "1";

    const enabled =
      enabledFilter === "true"
        ? true
        : enabledFilter === "false"
          ? false
          : undefined;

    if (countOnly) {
      const count = await prisma.financeAutoMatchRule.count({
        where: {
          tenantId: ctx.tenantId,
          ...(enabled !== undefined ? { enabled } : {}),
        },
      });
      return NextResponse.json(
        { success: true, data: { count } },
        { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
      );
    }

    const rules = await listRules(ctx.tenantId, { enabled });
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
    if (isFlowRowActionBody(parsed.data.action)) {
      const flowRow = await prisma.financeFlowRow.findFirst({
        where: {
          id: parsed.data.action.flowRowId,
          tenantId: ctx.tenantId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!flowRow) {
        return NextResponse.json(
          {
            success: false,
            error: "La fila de flujo no existe o está archivada",
          },
          { status: 400 },
        );
      }
    }
    const rule = await createRule(ctx.tenantId, ctx.userId, {
      ...parsed.data,
      conditions: parsed.data.conditions as RuleConditions,
      action: parsed.data.action as RuleAction,
    });

    // El histórico NO se corre acá: escanear hasta 20k movimientos bloqueaba
    // el guardado varios segundos/minutos. La UI ofrece post-creación
    // «¿Aplicar a movimientos pasados?» y existe
    // POST /automatch-rules/run-historical para corridas explícitas.
    return NextResponse.json(
      { success: true, data: { ...rule, historicalResult: null } },
      { status: 201 },
    );
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

