import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  computeWeeklyCloseSnapshot,
  nextWeekClosingDate,
} from "@/modules/finance/cashflow/weekly-close.service";

/**
 * GET /api/finance/cashflow/weekly-close/snapshot?weekEnd=ISO
 *
 * Retorna el snapshot calculado del cierre semanal (saldo banco, proyectado,
 * variance, bank txs sin asignar, cuotas no cumplidas) sin persistir nada.
 * Lo usa el drawer de cierre semanal para mostrar el desglose antes de que
 * el usuario decida cerrar / anclar.
 *
 * Si `weekEnd` no viene, usa la próxima fecha de cierre configurada.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const sp = new URL(request.url).searchParams;
  const dateParam = sp.get("weekEnd");
  const weekEnd = dateParam
    ? new Date(dateParam)
    : await nextWeekClosingDate(ctx.tenantId);
  if (isNaN(weekEnd.getTime())) {
    return NextResponse.json(
      { success: false, error: "weekEnd inválido" },
      { status: 400 },
    );
  }
  const snapshot = await computeWeeklyCloseSnapshot(ctx.tenantId, weekEnd);
  return NextResponse.json({
    success: true,
    data: {
      weekStartDate: snapshot.weekStartDate.toISOString(),
      weekEndDate: snapshot.weekEndDate.toISOString(),
      bankBalanceClp: snapshot.bankBalanceClp,
      openingBalanceClp: snapshot.openingBalanceClp,
      projectedBalanceClp: snapshot.projectedBalanceClp,
      varianceClp: snapshot.varianceClp,
      unassignedBank: snapshot.unassignedBank.map((u) => ({
        id: u.id,
        transactionDate: u.transactionDate.toISOString(),
        description: u.description,
        amount: u.amount,
        accountPlanCode: u.accountPlanCode,
      })),
      unfulfilledProj: snapshot.unfulfilledProj.map((u) => ({
        occurrenceId: u.occurrenceId,
        itemName: u.itemName,
        installationName: u.installationName,
        scheduledDate: u.scheduledDate.toISOString(),
        amountClp: u.amountClp,
        kind: u.kind,
        categoryCode: u.categoryCode,
      })),
    },
  });
}
