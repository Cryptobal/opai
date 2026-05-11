/**
 * GET /api/finance/cashflow/ipc-adjustments
 *
 * Lista ajustes IPC del tenant. Filtros opcionales: ?status=PENDING,
 * ?accountId=<crmAccountId> (resuelve los items via crm_account → item).
 * Default: devuelve los pendientes.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const accountId = url.searchParams.get("accountId");

  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    status,
  };
  if (accountId) {
    where.item = { crmAccountId: accountId };
  }

  const adjustments = await prisma.financeContractIpcAdjustment.findMany({
    where,
    include: {
      item: {
        select: {
          id: true,
          name: true,
          amount: true,
          currency: true,
          crmAccountId: true,
          installationId: true,
          ipcAdjustmentMonths: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: adjustments.map((a) => ({
      id: a.id,
      itemId: a.itemId,
      itemName: a.item.name,
      itemAmount: Number(a.item.amount),
      currency: a.item.currency,
      crmAccountId: a.item.crmAccountId,
      installationId: a.item.installationId,
      ipcAdjustmentMonths: a.item.ipcAdjustmentMonths,
      dueDate: a.dueDate,
      status: a.status,
      appliedPct: a.appliedPct ? Number(a.appliedPct) : null,
      oldAmount: a.oldAmount ? Number(a.oldAmount) : null,
      newAmount: a.newAmount ? Number(a.newAmount) : null,
      appliedAt: a.appliedAt,
      notes: a.notes,
    })),
  });
}
