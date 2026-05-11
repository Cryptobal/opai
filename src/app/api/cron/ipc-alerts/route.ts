/**
 * API Route: /api/cron/ipc-alerts
 * GET — Detecta items de flujo de caja con `hasIpcAdjustment=true` cuya
 * próxima fecha de ajuste cae en los próximos 30 días y aún no tienen
 * registro `FinanceContractIpcAdjustment` creado. Crea uno en estado
 * PENDING y dispara una notificación al equipo de finanzas del tenant.
 *
 * Programado en vercel.json: schedule "0 8 * * *" (8 AM UTC ≈ 5 AM Chile).
 * Protegido con CRON_SECRET (Authorization: Bearer <secret>).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePendingForItem } from "@/modules/finance/cashflow/ipc-adjustment.service";
import { notify } from "@/lib/notifications/notify";

interface TenantSummary {
  tenantId: string;
  itemsChecked: number;
  pendingCreated: number;
  errors: string[];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Buscamos por tenant los items con IPC activos. Si la tabla no tiene
  // ninguno, el cron retorna sin error rápidamente.
  const items = await prisma.financeCashflowItem.findMany({
    where: {
      isActive: true,
      hasIpcAdjustment: true,
      ipcAdjustmentMonths: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      startDate: true,
      endDate: true,
      ipcAdjustmentMonths: true,
      crmAccountId: true,
    },
  });

  // Agrupamos por tenant para acumular el contador de notificaciones.
  const byTenant = new Map<string, typeof items>();
  for (const it of items) {
    if (!byTenant.has(it.tenantId)) byTenant.set(it.tenantId, []);
    byTenant.get(it.tenantId)!.push(it);
  }

  const summaries: TenantSummary[] = [];
  for (const [tenantId, list] of byTenant) {
    const summary: TenantSummary = {
      tenantId,
      itemsChecked: list.length,
      pendingCreated: 0,
      errors: [],
    };
    for (const item of list) {
      try {
        const created = await ensurePendingForItem(
          {
            id: item.id,
            tenantId: item.tenantId,
            startDate: item.startDate,
            endDate: item.endDate,
            ipcAdjustmentMonths: item.ipcAdjustmentMonths,
          },
          30,
        );
        if (created.length > 0) {
          summary.pendingCreated += created.length;
          for (const adj of created) {
            const dueStr = adj.dueDate.toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            });
            await notify({
              tenantId,
              type: "contract_ipc_adjustment_due",
              title: `Ajuste de IPC pendiente: ${item.name}`,
              body: `El contrato "${item.name}" tiene su próximo ajuste de IPC el ${dueStr}. Ingresá el % del período para actualizar el flujo de caja.`,
              link: item.crmAccountId
                ? `/crm/accounts/${item.crmAccountId}?tab=contracts`
                : `/finanzas/flujo-caja`,
              data: {
                itemId: item.id,
                adjustmentId: adj.id,
                dueDate: adj.dueDate.toISOString(),
              },
            });
          }
        }
      } catch (err) {
        summary.errors.push(
          `item ${item.id}: ${err instanceof Error ? err.message : "error"}`,
        );
      }
    }
    summaries.push(summary);
  }

  return NextResponse.json({
    success: true,
    summaries,
    totalItems: items.length,
    totalCreated: summaries.reduce((s, t) => s + t.pendingCreated, 0),
  });
}
