import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/banking/transactions/counts?bankAccountId=...
 *
 * Devuelve los conteos para los sub-tabs de Movimientos. Una sola query
 * agrupada en lugar de 4 separadas. Se usa para mostrar badges con número
 * en los tabs.
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get("bankAccountId");
    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, error: "bankAccountId requerido" },
        { status: 400 },
      );
    }

    // El filtro de dirección (ingreso/egreso) debe aplicarse a TODOS los
    // conteos: si no, el badge del tab (ej. "Reconocidos 8") cuenta ingresos
    // + egresos mientras la lista filtra solo por el signo activo, dejando al
    // usuario con "8 reconocidos" pero "Sin movimientos" en la lista. El signo
    // se determina por el monto (>0 ingreso, <0 egreso), igual que en
    // listBankTransactions.
    const direction = searchParams.get("direction") ?? "all";
    const amountFilter =
      direction === "inflow"
        ? { amount: { gt: 0 } }
        : direction === "outflow"
          ? { amount: { lt: 0 } }
          : {};

    const base = {
      tenantId: ctx.tenantId,
      bankAccountId,
      hiddenAt: null,
      ...amountFilter,
    } as const;

    const [all, recognized, unrecognized, matched] = await Promise.all([
      prisma.financeBankTransaction.count({ where: base }),
      prisma.financeBankTransaction.count({
        where: {
          ...base,
          reconciliationStatus: "UNMATCHED",
          suggestedAccountPlanId: { not: null },
        },
      }),
      prisma.financeBankTransaction.count({
        where: {
          ...base,
          reconciliationStatus: "UNMATCHED",
          suggestedAccountPlanId: null,
        },
      }),
      prisma.financeBankTransaction.count({
        where: {
          ...base,
          reconciliationStatus: { in: ["MATCHED", "RECONCILED"] },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { all, recognized, unrecognized, matched },
    });
  } catch (error) {
    console.error("[Finance/Banking/Counts] GET Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al contar movimientos" },
      { status: 500 },
    );
  }
}
