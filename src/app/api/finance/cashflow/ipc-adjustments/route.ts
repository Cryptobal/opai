/**
 * GET /api/finance/cashflow/ipc-adjustments
 *
 * Lista ajustes IPC del tenant. Filtros opcionales:
 *   ?status=PENDING          → filtro por estado (default PENDING)
 *   ?accountId=<crmAccountId> → solo items de una cuenta CRM
 *   ?projectUntil=YYYY-MM-DD  → ADEMÁS incluye dueDates TEÓRICAS futuras
 *                                hasta esa fecha (no persistidas en DB).
 *                                Útil para el FC: el cron solo crea PENDING
 *                                a 30 días, pero el FC muestra hasta 1 año
 *                                y necesita marcar las celdas correspondientes
 *                                a reajustes proyectados (ej. IPC cada 2/6/12
 *                                meses).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function addMonthsUtc(d: Date, n: number): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return out;
}

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
  const projectUntilRaw = url.searchParams.get("projectUntil");
  const projectUntil =
    projectUntilRaw && /^\d{4}-\d{2}-\d{2}$/.test(projectUntilRaw)
      ? new Date(`${projectUntilRaw}T00:00:00.000Z`)
      : null;

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

  const real = adjustments.map((a) => ({
    id: a.id,
    itemId: a.itemId,
    itemName: a.item.name,
    itemAmount: Number(a.item.amount),
    currency: a.item.currency,
    crmAccountId: a.item.crmAccountId,
    installationId: a.item.installationId,
    ipcAdjustmentMonths: a.item.ipcAdjustmentMonths,
    dueDate: a.dueDate.toISOString(),
    status: a.status as string,
    appliedPct: a.appliedPct ? Number(a.appliedPct) : null,
    oldAmount: a.oldAmount ? Number(a.oldAmount) : null,
    newAmount: a.newAmount ? Number(a.newAmount) : null,
    appliedAt: a.appliedAt,
    notes: a.notes,
  }));

  // Proyección teórica: items con hasIpcAdjustment activos que tendrán
  // reajustes en el horizonte. Anclamos al último APPLIED (si existe)
  // o al startDate del item. Excluye fechas ya cubiertas por adjustments
  // PENDING o APPLIED reales para no duplicar.
  let projected: typeof real = [];
  if (projectUntil) {
    const accountFilter = accountId
      ? { crmAccountId: accountId }
      : {};
    const items = await prisma.financeCashflowItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        hasIpcAdjustment: true,
        ipcAdjustmentMonths: { gt: 0 },
        currency: "CLP",
        ...accountFilter,
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        crmAccountId: true,
        installationId: true,
        ipcAdjustmentMonths: true,
        startDate: true,
        endDate: true,
        ipcAdjustments: {
          select: { dueDate: true, status: true },
        },
      },
    });

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    for (const item of items) {
      const months = item.ipcAdjustmentMonths!;
      // Anclar al último APPLIED (mayor dueDate con status=APPLIED), o
      // al startDate si no hay historial aplicado.
      const lastApplied = item.ipcAdjustments
        .filter((a) => a.status === "APPLIED")
        .reduce<Date | null>((acc, a) => {
          if (!acc || a.dueDate > acc) return a.dueDate;
          return acc;
        }, null);
      const anchor = lastApplied ?? item.startDate;
      const existingDates = new Set(
        item.ipcAdjustments.map((a) =>
          a.dueDate.toISOString().slice(0, 10),
        ),
      );
      for (let i = 1; i <= 60; i += 1) {
        const due = addMonthsUtc(anchor, months * i);
        if (due > projectUntil) break;
        if (item.endDate && due > item.endDate) break;
        if (due <= today) continue;
        const key = due.toISOString().slice(0, 10);
        if (existingDates.has(key)) continue;
        projected.push({
          id: `projected_${item.id}_${key}`,
          itemId: item.id,
          itemName: item.name,
          itemAmount: Number(item.amount),
          currency: item.currency,
          crmAccountId: item.crmAccountId,
          installationId: item.installationId,
          ipcAdjustmentMonths: months,
          dueDate: due.toISOString(),
          status: "PROJECTED",
          appliedPct: null,
          oldAmount: null,
          newAmount: null,
          appliedAt: null,
          notes: null,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: [...real, ...projected],
  });
}
