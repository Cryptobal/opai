/**
 * API Route: /api/cron/ipc-alerts-recurring
 * GET — Detecta plantillas de Programación (FinanceDteRecurringTemplate) con
 * `hasIpcAdjustment=true` cuya próxima fecha de reajuste cae dentro de los
 * próximos 30 días y dispara UNA notificación al equipo de finanzas para que
 * ingrese el % real editando las líneas de la plantilla.
 *
 * Modo "manual con alerta": el cron NO modifica montos — solo avisa. El
 * anti-duplicado usa `ipcLastAlertedFor` (fecha de reajuste ya notificada).
 *
 * Programado en vercel.json: schedule "0 8 * * *" (8 AM UTC ≈ 5 AM Chile).
 * Protegido con CRON_SECRET (Authorization: Bearer <secret>).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";

const HORIZON_DAYS = 30;

interface TenantSummary {
  tenantId: string;
  templatesChecked: number;
  alertsSent: number;
  errors: string[];
}

/** Suma `months` meses a una fecha en UTC, conservando el día (clamp a fin de mes). */
function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(
    Date.UTC(d.getUTCFullYear(), targetMonth, 1, 0, 0, 0, 0),
  );
  // Clamp el día al último día del mes destino si el original lo excede.
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return result;
}

/**
 * Próxima fecha de reajuste IPC >= `from`, a partir del ancla y la frecuencia.
 * Devuelve null si ya pasó el `endDate` de la plantilla.
 */
function nextDueDate(
  anchor: Date,
  months: number,
  from: Date,
  endDate: Date | null,
): Date | null {
  if (months <= 0) return null;
  let due = addMonthsUtc(anchor, months);
  let guard = 0;
  while (due < from && guard < 600) {
    due = addMonthsUtc(due, months);
    guard++;
  }
  if (endDate && due > endDate) return null;
  return due;
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

  const templates = await prisma.financeDteRecurringTemplate.findMany({
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
      ipcStartDate: true,
      ipcLastAlertedFor: true,
      crmAccountId: true,
    },
  });

  // Hoy en UTC (date-only) para comparar contra fechas @db.Date.
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + HORIZON_DAYS);

  const byTenant = new Map<string, typeof templates>();
  for (const t of templates) {
    if (!byTenant.has(t.tenantId)) byTenant.set(t.tenantId, []);
    byTenant.get(t.tenantId)!.push(t);
  }

  const summaries: TenantSummary[] = [];
  for (const [tenantId, list] of byTenant) {
    const summary: TenantSummary = {
      tenantId,
      templatesChecked: list.length,
      alertsSent: 0,
      errors: [],
    };
    for (const tpl of list) {
      try {
        const anchor = tpl.ipcStartDate ?? tpl.startDate;
        const due = nextDueDate(
          anchor,
          tpl.ipcAdjustmentMonths!,
          today,
          tpl.endDate,
        );
        if (!due) continue;
        // Fuera del horizonte de aviso → todavía no avisamos.
        if (due > horizon) continue;
        // Ya avisamos por esta misma fecha de reajuste → no duplicar.
        if (
          tpl.ipcLastAlertedFor &&
          tpl.ipcLastAlertedFor.getTime() === due.getTime()
        ) {
          continue;
        }

        const dueStr = due.toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
        await notify({
          tenantId,
          type: "contract_ipc_adjustment_due",
          title: `Reajuste de IPC pendiente: ${tpl.name}`,
          body: `La programación "${tpl.name}" tiene su próximo reajuste de IPC el ${dueStr}. Editá las líneas de la plantilla con el monto reajustado antes de la próxima emisión.`,
          link: `/finanzas/facturacion/programacion`,
          data: {
            templateId: tpl.id,
            dueDate: due.toISOString(),
            crmAccountId: tpl.crmAccountId,
          },
        });

        await prisma.financeDteRecurringTemplate.update({
          where: { id: tpl.id },
          data: { ipcLastAlertedFor: due },
        });
        summary.alertsSent += 1;
      } catch (err) {
        summary.errors.push(
          `template ${tpl.id}: ${err instanceof Error ? err.message : "error"}`,
        );
      }
    }
    summaries.push(summary);
  }

  return NextResponse.json({
    success: true,
    summaries,
    totalTemplates: templates.length,
    totalAlerts: summaries.reduce((s, t) => s + t.alertsSent, 0),
  });
}
