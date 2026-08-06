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

export const dynamic = "force-dynamic";

const UNDO_CAP = 5000;

const bodySchema = z.object({
  ruleId: z.string().uuid(),
});

/**
 * POST /api/finance/banking/links/undo-by-rule
 *
 * Elimina links con matchedByRuleId de la regla (tenant), devuelve las
 * transacciones a UNMATCHED y limpia sugerencias. Cap 5.000; idempotente.
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
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const rule = await prisma.financeAutoMatchRule.findFirst({
      where: { id: parsed.data.ruleId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Regla no encontrada" },
        { status: 404 },
      );
    }

    const links = await prisma.financeBankTransactionLink.findMany({
      where: {
        tenantId: ctx.tenantId,
        matchedByRuleId: rule.id,
      },
      select: { id: true, bankTransactionId: true },
      take: UNDO_CAP + 1,
    });
    const reachedCap = links.length > UNDO_CAP;
    const batch = reachedCap ? links.slice(0, UNDO_CAP) : links;
    const txIds = [...new Set(batch.map((l) => l.bankTransactionId))];

    if (batch.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          undone: 0,
          transactions: 0,
          reachedCap: false,
          ruleName: rule.name,
        },
      });
    }

    await prisma.$transaction([
      prisma.financeBankTransactionLink.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          id: { in: batch.map((l) => l.id) },
        },
      }),
      prisma.financeBankTransaction.updateMany({
        where: {
          tenantId: ctx.tenantId,
          id: { in: txIds },
          reconciliationStatus: { in: ["MATCHED", "RECONCILED"] },
        },
        data: {
          reconciliationStatus: "UNMATCHED",
          suggestedRuleId: null,
          suggestedAccountPlanId: null,
        },
      }),
    ]);

    // Si alguna tx quedó con otros links, volver a MATCHED.
    const stillLinked = await prisma.financeBankTransactionLink.findMany({
      where: {
        tenantId: ctx.tenantId,
        bankTransactionId: { in: txIds },
      },
      select: { bankTransactionId: true },
    });
    const stillIds = [...new Set(stillLinked.map((l) => l.bankTransactionId))];
    if (stillIds.length > 0) {
      await prisma.financeBankTransaction.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: stillIds } },
        data: { reconciliationStatus: "MATCHED" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        undone: batch.length,
        transactions: txIds.length - stillIds.length,
        reachedCap,
        ruleName: rule.name,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/UndoByRule] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 },
    );
  }
}
