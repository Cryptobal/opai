import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * GET /api/ops/control-nocturno/kpis
 *
 * Returns aggregated KPI data for control nocturno reports.
 * Query params:
 *   - dateFrom (YYYY-MM-DD) — defaults to 30 days ago
 *   - dateTo   (YYYY-MM-DD) — defaults to today
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const dateFrom = sp.get("dateFrom")
      ? new Date(sp.get("dateFrom")! + "T00:00:00")
      : defaultFrom;
    const dateTo = sp.get("dateTo")
      ? new Date(sp.get("dateTo")! + "T23:59:59")
      : now;

    // Fetch all finalized reports in range with ronda data
    const reportes = await prisma.opsControlNocturno.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["aprobado", "enviado"] },
        date: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        date: true,
        instalaciones: {
          select: {
            installationId: true,
            installationName: true,
            statusInstalacion: true,
            rondas: {
              select: {
                status: true,
                horaEsperada: true,
                horaMarcada: true,
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    // ── Aggregate per installation ──
    type InstAgg = {
      installationId: string | null;
      installationName: string;
      totalRondas: number;
      completadas: number;
      omitidas: number;
      pendientes: number;
      noAplica: number;
      desvMinutos: number[];
      reportCount: number;
      novedades: number;
      criticos: number;
    };
    const instMap = new Map<string, InstAgg>();

    // ── Aggregate per week (ISO week) ──
    type WeekAgg = {
      weekLabel: string;
      weekStart: string;
      totalRondas: number;
      completadas: number;
    };
    const weekMap = new Map<string, WeekAgg>();

    let globalTotal = 0;
    let globalCompletadas = 0;
    let globalOmitidas = 0;

    for (const rep of reportes) {
      // ISO week key
      const d = new Date(rep.date);
      const weekKey = getISOWeekKey(d);
      const weekStart = getWeekStart(d).toISOString().slice(0, 10);

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekLabel: weekKey,
          weekStart,
          totalRondas: 0,
          completadas: 0,
        });
      }
      const week = weekMap.get(weekKey)!;

      for (const inst of rep.instalaciones) {
        const key = inst.installationId || inst.installationName;
        if (!instMap.has(key)) {
          instMap.set(key, {
            installationId: inst.installationId,
            installationName: inst.installationName,
            totalRondas: 0,
            completadas: 0,
            omitidas: 0,
            pendientes: 0,
            noAplica: 0,
            desvMinutos: [],
            reportCount: 0,
            novedades: 0,
            criticos: 0,
          });
        }
        const agg = instMap.get(key)!;
        agg.reportCount++;
        if (inst.statusInstalacion === "novedad") agg.novedades++;
        if (inst.statusInstalacion === "critico") agg.criticos++;

        for (const r of inst.rondas) {
          if (r.status === "no_aplica") {
            agg.noAplica++;
            continue;
          }
          agg.totalRondas++;
          globalTotal++;
          week.totalRondas++;

          if (r.status === "completada") {
            agg.completadas++;
            globalCompletadas++;
            week.completadas++;

            // Deviation in minutes
            if (r.horaMarcada && r.horaEsperada) {
              const dev = timeDiffMinutes(r.horaEsperada, r.horaMarcada);
              if (dev !== null) agg.desvMinutos.push(dev);
            }
          } else if (r.status === "omitida") {
            agg.omitidas++;
            globalOmitidas++;
          } else {
            agg.pendientes++;
          }
        }
      }
    }

    // Build installation KPIs sorted by compliance (worst first)
    const ALERT_THRESHOLD = 80;
    const installations = Array.from(instMap.values())
      .map((a) => {
        const cumplimiento =
          a.totalRondas > 0 ? Math.round((a.completadas / a.totalRondas) * 100) : 100;
        const avgDesvMin =
          a.desvMinutos.length > 0
            ? Math.round(a.desvMinutos.reduce((s, v) => s + v, 0) / a.desvMinutos.length)
            : 0;
        return {
          installationId: a.installationId,
          installationName: a.installationName,
          totalRondas: a.totalRondas,
          completadas: a.completadas,
          omitidas: a.omitidas,
          cumplimiento,
          avgDesvMin,
          reportCount: a.reportCount,
          novedades: a.novedades,
          criticos: a.criticos,
          alert: cumplimiento < ALERT_THRESHOLD,
        };
      })
      .sort((a, b) => a.cumplimiento - b.cumplimiento);

    // Weekly trend sorted chronologically
    const weeklyTrend = Array.from(weekMap.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((w) => ({
        weekLabel: w.weekLabel,
        weekStart: w.weekStart,
        cumplimiento:
          w.totalRondas > 0 ? Math.round((w.completadas / w.totalRondas) * 100) : 100,
        totalRondas: w.totalRondas,
        completadas: w.completadas,
      }));

    const globalCumplimiento =
      globalTotal > 0 ? Math.round((globalCompletadas / globalTotal) * 100) : 100;

    const alertCount = installations.filter((i) => i.alert).length;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          from: dateFrom.toISOString().slice(0, 10),
          to: dateTo.toISOString().slice(0, 10),
          reportCount: reportes.length,
        },
        global: {
          totalRondas: globalTotal,
          completadas: globalCompletadas,
          omitidas: globalOmitidas,
          cumplimiento: globalCumplimiento,
          alertCount,
        },
        installations,
        weeklyTrend,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching control nocturno KPIs:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los KPIs" },
      { status: 500 },
    );
  }
}

/* ── Helpers ── */

function getISOWeekKey(d: Date): string {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `S${weekNum}`;
}

function getWeekStart(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  const day = tmp.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  tmp.setDate(tmp.getDate() + diff);
  return tmp;
}

function timeDiffMinutes(expected: string, actual: string): number | null {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const e = toMin(expected);
  const a = toMin(actual);
  if (e === null || a === null) return null;
  let diff = a - e;
  // Handle midnight crossing
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return Math.abs(diff);
}
