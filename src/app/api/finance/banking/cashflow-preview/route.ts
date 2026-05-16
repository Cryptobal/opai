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
import { resolveCategoryFromAccount } from "@/modules/finance/cashflow/categoryAccount.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountPlanId: z.string().uuid(),
  amount: z.number(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/finance/banking/cashflow-preview
 *
 * Predice qué pasará con el flujo de caja al conciliar una tx contra una
 * cuenta contable específica. NO escribe nada. Sirve para mostrar feedback
 * en vivo en el drawer de Conciliar movimiento (tab Categorizar manual).
 *
 * Devuelve uno de cuatro status:
 *   - DTE_PAID: la cuenta está vinculada a una factura proyectada que se
 *     marcará PAID. (Por ahora no se evalúa acá; lo cubre el path DTE.)
 *   - MATCHED_OCCURRENCE: hay una occurrence PROYECTADA en la categoría
 *     de la cuenta dentro de ventana de tolerancia → quedará vinculada.
 *   - REALIZED_AGGREGATE: la cuenta está mapeada a una categoría pero no
 *     hay occurrence proyectada cercana → se suma al realizado agregado.
 *   - UNMAPPED: la cuenta no tiene categoría asignada → se preguntará después.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const { accountPlanId, transactionDate } = parsed.data;
    const category = await resolveCategoryFromAccount(
      ctx.tenantId,
      accountPlanId,
    );

    if (!category) {
      return NextResponse.json({
        success: true,
        data: {
          status: "UNMAPPED",
          categoryCode: null,
          categoryName: null,
          matchedOccurrenceDate: null,
        },
      });
    }

    // Buscar occurrence PROYECTADA en esta categoría dentro de ventana.
    // Tolerancia: ±15 días (suficiente para cubrir tolerancia config default).
    const txDate = new Date(transactionDate);
    const windowFrom = new Date(txDate);
    windowFrom.setDate(windowFrom.getDate() - 15);
    const windowTo = new Date(txDate);
    windowTo.setDate(windowTo.getDate() + 15);

    const occurrence = await prisma.financeCashflowOccurrence.findFirst({
      where: {
        tenantId: ctx.tenantId,
        status: "PROJECTED",
        bankTransactionId: null,
        scheduledDate: { gte: windowFrom, lte: windowTo },
        item: { categoryId: category.id, isActive: true },
      },
      select: { id: true, scheduledDate: true },
      orderBy: { scheduledDate: "asc" },
    });

    if (occurrence) {
      return NextResponse.json({
        success: true,
        data: {
          status: "MATCHED_OCCURRENCE",
          categoryCode: category.code,
          categoryName: category.name,
          matchedOccurrenceDate: occurrence.scheduledDate
            .toISOString()
            .slice(0, 10),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: "REALIZED_AGGREGATE",
        categoryCode: category.code,
        categoryName: category.name,
        matchedOccurrenceDate: null,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/CashflowPreview] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 },
    );
  }
}
