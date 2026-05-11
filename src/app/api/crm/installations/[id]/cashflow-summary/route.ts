import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/crm/installations/[id]/cashflow-summary
 *
 * Devuelve el resumen mensual proyectado de una instalación según los
 * `FinanceCashflowItem` activos asociados (PAYROLL, CONTRACT, OTHER, etc).
 * Pensado para una tarjeta en el detalle de la instalación.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx, "installations");
  if (forbidden) return forbidden;

  const { id: installationId } = await params;

  try {
    const items = await prisma.financeCashflowItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        source: true,
        amount: true,
        currency: true,
        dayOfMonth: true,
        recurrence: true,
        category: { select: { name: true, code: true } },
      },
    });

    let monthlyIncomeClp = 0;
    let monthlyExpenseClp = 0;
    const breakdown: Array<{
      id: string;
      name: string;
      kind: "INCOME" | "EXPENSE";
      source: string;
      amountClp: number;
      currency: string;
      dayOfMonth: number | null;
      categoryName: string | null;
    }> = [];

    for (const it of items) {
      // Solo consideramos items con recurrencia MENSUAL para el "costo
      // proyectado mensual". Otros (ONCE, ANNUAL) los ignoramos en el
      // resumen pero los incluimos en el breakdown.
      const amt = Number(it.amount);
      if (it.recurrence === "MONTHLY" && it.currency === "CLP") {
        if (it.kind === "INCOME") monthlyIncomeClp += amt;
        else monthlyExpenseClp += amt;
      }
      breakdown.push({
        id: it.id,
        name: it.name,
        kind: it.kind as "INCOME" | "EXPENSE",
        source: it.source,
        amountClp: amt,
        currency: it.currency,
        dayOfMonth: it.dayOfMonth,
        categoryName: it.category?.name ?? null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        installationId,
        monthlyIncomeClp,
        monthlyExpenseClp,
        monthlyNetClp: monthlyIncomeClp - monthlyExpenseClp,
        breakdown,
      },
    });
  } catch (error) {
    console.error("[CRM] GET installation cashflow-summary:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
