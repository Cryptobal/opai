/**
 * API Route: /api/cron/cashflow-drift-check
 *
 * Para cada tenant con FinanceCashflowConfig:
 *  1. Calcula drift actual (vía resolveOpeningBalance + buildProjection).
 *  2. Si |drift| >= driftAlertThresholdClp y el último weekly_close también
 *     superaba el umbral (mismo signo), dispara notify(cashflow_drift_alert).
 *
 * Protegido con CRON_SECRET. Programado en vercel.json (8 AM Chile).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { addWeeks } from "date-fns";
import { notify } from "@/lib/notifications/notify";

export async function GET(request: NextRequest) {
  try {
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

    const configs = await prisma.financeCashflowConfig.findMany({
      select: { tenantId: true, driftAlertThresholdClp: true },
    });

    const results: Array<{
      tenantId: string;
      drift: number | null;
      threshold: number;
      alerted: boolean;
    }> = [];

    const today = new Date();

    for (const cfg of configs) {
      if (cfg.driftAlertThresholdClp <= 0) {
        results.push({
          tenantId: cfg.tenantId,
          drift: null,
          threshold: cfg.driftAlertThresholdClp,
          alerted: false,
        });
        continue;
      }

      let drift: number | null = null;
      try {
        const projection = await buildProjection(cfg.tenantId, {
          from: today,
          to: addWeeks(today, 4),
          granularity: "weekly",
        });
        drift = projection.totals.currentDriftClp;
      } catch (err) {
        console.error(
          `[cashflow-drift-check] tenant ${cfg.tenantId} projection failed:`,
          err,
        );
        results.push({
          tenantId: cfg.tenantId,
          drift: null,
          threshold: cfg.driftAlertThresholdClp,
          alerted: false,
        });
        continue;
      }

      if (drift === null || Math.abs(drift) < cfg.driftAlertThresholdClp) {
        results.push({
          tenantId: cfg.tenantId,
          drift,
          threshold: cfg.driftAlertThresholdClp,
          alerted: false,
        });
        continue;
      }

      // Persistencia: ¿el último cierre semanal ya tenía drift sobre umbral
      // con el mismo signo? Si sí, llevamos 2+ días drifteando y disparamos.
      const lastClose = await prisma.financeCashflowWeeklyClose.findFirst({
        where: { tenantId: cfg.tenantId },
        orderBy: { weekEndDate: "desc" },
        select: { varianceClp: true, weekEndDate: true },
      });

      const lastVariance = lastClose ? Number(lastClose.varianceClp) : null;
      const persistent =
        lastVariance !== null &&
        Math.abs(lastVariance) >= cfg.driftAlertThresholdClp &&
        Math.sign(lastVariance) === Math.sign(drift);

      let alerted = false;
      if (persistent) {
        try {
          await notify({
            tenantId: cfg.tenantId,
            type: "cashflow_drift_alert",
            title: "Drift de caja persistente",
            body: `Saldo banco real vs proyectado: ${drift > 0 ? "+" : ""}${drift.toLocaleString("es-CL")} CLP. Revisa el panel de cuadratura.`,
            link: "/finanzas/flujo-caja/cuadratura",
            data: { driftClp: drift, thresholdClp: cfg.driftAlertThresholdClp },
          });
          alerted = true;
        } catch (err) {
          console.error(
            `[cashflow-drift-check] tenant ${cfg.tenantId} notify failed:`,
            err,
          );
        }
      }

      results.push({
        tenantId: cfg.tenantId,
        drift,
        threshold: cfg.driftAlertThresholdClp,
        alerted,
      });
    }

    return NextResponse.json({
      success: true,
      processed: configs.length,
      alerted: results.filter((r) => r.alerted).length,
      results,
    });
  } catch (error) {
    console.error("[cashflow-drift-check] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 },
    );
  }
}
