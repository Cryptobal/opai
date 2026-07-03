/**
 * API Route: /api/cron/accounting-period-monitor
 * GET — Recordatorio de cierre de período contable.
 *
 * Filosofía (prompt 12): la APERTURA de un período es plomería invisible; el
 * CIERRE es un acto contable humano que JAMÁS se automatiza — se recuerda
 * insistentemente. Este cron es ese empujón.
 *
 * Programado día 1 (`0 12 1 * *`) y refuerzo día 5 (`0 12 5 * *`), 08:00 Chile.
 * Por cada tenant cuyo período del MES ANTERIOR siga OPEN, notifica a quienes
 * pueden ver contabilidad (module finance / submodule contabilidad) con el
 * conteo de asientos y de documentos sin asiento + link directo. Con el ruteo
 * Slack existente, el aviso llega también al canal de finanzas gratis.
 *
 * Dedupe: dedupKey por tenant+período+día (patrón sla-monitor) para no duplicar
 * si Vercel reintenta la corrida el mismo día.
 *
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { todayChileStr } from "@/lib/fx-date";
import { countDocumentsWithoutEntry } from "@/modules/finance/accounting/accounting-health.service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fecha "hoy" en Chile → mes anterior a cerrar.
    const todayStr = todayChileStr(); // YYYY-MM-DD
    const [curYear, curMonth] = todayStr.split("-").map((s) => parseInt(s, 10));
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const periodLabel = `${MONTH_NAMES_ES[prevMonth - 1]} ${prevYear}`;

    // Períodos del mes anterior que siguen abiertos, por tenant.
    const openPeriods = await prisma.financeAccountingPeriod.findMany({
      where: { year: prevYear, month: prevMonth, status: "OPEN" },
      select: { id: true, tenantId: true },
    });

    let notified = 0;
    const skipped: string[] = [];

    for (const period of openPeriods) {
      const dedupKey = `${period.tenantId}:${prevYear}-${prevMonth}:${todayStr}`;

      // Dedupe: ¿ya notificamos este período+día? (reruns del cron)
      const already = await prisma.notification.findFirst({
        where: {
          tenantId: period.tenantId,
          type: "accounting_period_close_reminder",
          data: { path: ["dedupKey"], equals: dedupKey },
        },
        select: { id: true },
      });
      if (already) {
        skipped.push(period.tenantId);
        continue;
      }

      const [entryCount, orphanCount] = await Promise.all([
        prisma.financeJournalEntry.count({
          where: { tenantId: period.tenantId, periodId: period.id },
        }),
        countDocumentsWithoutEntry(period.tenantId, {
          year: prevYear,
          month: prevMonth,
        }),
      ]);

      const orphanLine =
        orphanCount > 0
          ? ` Hay ${orphanCount} documento(s) sin asiento — genéralos antes de cerrar.`
          : "";

      await notify({
        tenantId: period.tenantId,
        type: "accounting_period_close_reminder",
        title: `${periodLabel} sigue abierto — revisa y cierra`,
        body: `El período contable de ${periodLabel} sigue abierto (${entryCount} asiento(s)).${orphanLine} Cuadra, revisa y ciérralo.`,
        link: "/finanzas/contabilidad",
        data: {
          dedupKey,
          periodId: period.id,
          year: prevYear,
          month: prevMonth,
          entryCount,
          orphanCount,
        },
      });
      notified++;
    }

    return NextResponse.json({
      success: true,
      data: {
        period: `${prevYear}-${String(prevMonth).padStart(2, "0")}`,
        openPeriods: openPeriods.length,
        notified,
        skippedDuplicates: skipped.length,
      },
    });
  } catch (error) {
    console.error("[CRON] accounting-period-monitor error:", error);
    return NextResponse.json(
      { success: false, error: "accounting-period-monitor failed" },
      { status: 500 },
    );
  }
}
