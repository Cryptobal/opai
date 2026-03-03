import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type InstEntry = {
  installationId: string;
  name: string;
  ppcCount: number;
  totalPuestos: number;
  ppcPercentage: number;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const days = Math.min(Number(request.nextUrl.searchParams.get("days") || "90"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await prisma.opsPpcSnapshot.findMany({
      where: { tenantId: ctx.tenantId, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, byInstallation: true },
    });

    if (snapshots.length === 0) {
      return NextResponse.json({ success: true, data: { rankings: [], series: {} } });
    }

    // Accumulate per-installation stats across all snapshots
    const instStats = new Map<string, {
      name: string;
      totalPpcSum: number;
      totalPuestosSum: number;
      snapshotCount: number;
      latestPpcCount: number;
      latestTotalPuestos: number;
      latestPpcPercentage: number;
      // last 7 days vs previous 7 days for trend
      recent7Sum: number;
      recent7PuestosSum: number;
      recent7Count: number;
      prev7Sum: number;
      prev7PuestosSum: number;
      prev7Count: number;
      // time series points
      points: { date: string; ppcCount: number; totalPuestos: number; ppcPercentage: number }[];
    }>();

    const now = Date.now();
    const ms7d = 7 * 24 * 60 * 60 * 1000;

    for (const snap of snapshots) {
      const entries = snap.byInstallation as InstEntry[] | null;
      if (!Array.isArray(entries)) continue;

      const snapDate = new Date(snap.date);
      const snapMs = snapDate.getTime();
      const age = now - snapMs;
      const isRecent7 = age <= ms7d;
      const isPrev7 = age > ms7d && age <= ms7d * 2;
      const dateStr = snapDate.toISOString().slice(0, 10);

      for (const entry of entries) {
        let stat = instStats.get(entry.installationId);
        if (!stat) {
          stat = {
            name: entry.name,
            totalPpcSum: 0, totalPuestosSum: 0, snapshotCount: 0,
            latestPpcCount: 0, latestTotalPuestos: 0, latestPpcPercentage: 0,
            recent7Sum: 0, recent7PuestosSum: 0, recent7Count: 0,
            prev7Sum: 0, prev7PuestosSum: 0, prev7Count: 0,
            points: [],
          };
          instStats.set(entry.installationId, stat);
        }

        stat.totalPpcSum += entry.ppcCount;
        stat.totalPuestosSum += entry.totalPuestos;
        stat.snapshotCount++;
        stat.latestPpcCount = entry.ppcCount;
        stat.latestTotalPuestos = entry.totalPuestos;
        stat.latestPpcPercentage = entry.ppcPercentage;

        if (isRecent7) {
          stat.recent7Sum += entry.ppcCount;
          stat.recent7PuestosSum += entry.totalPuestos;
          stat.recent7Count++;
        } else if (isPrev7) {
          stat.prev7Sum += entry.ppcCount;
          stat.prev7PuestosSum += entry.totalPuestos;
          stat.prev7Count++;
        }

        stat.points.push({
          date: dateStr,
          ppcCount: entry.ppcCount,
          totalPuestos: entry.totalPuestos,
          ppcPercentage: entry.ppcPercentage,
        });
      }
    }

    // Build rankings + weekly series grouped
    const rankings = Array.from(instStats.entries()).map(([installationId, s]) => {
      const avgPpc = s.snapshotCount > 0 ? Math.round((s.totalPpcSum / s.snapshotCount) * 10) / 10 : 0;
      const avgPuestos = s.snapshotCount > 0 ? Math.round(s.totalPuestosSum / s.snapshotCount) : 0;
      const avgPercentage = avgPuestos > 0 ? Math.round((avgPpc / avgPuestos) * 10000) / 100 : 0;

      const recent7Pct = s.recent7Count > 0 && s.recent7PuestosSum > 0
        ? (s.recent7Sum / s.recent7Count) / (s.recent7PuestosSum / s.recent7Count) * 100
        : null;
      const prev7Pct = s.prev7Count > 0 && s.prev7PuestosSum > 0
        ? (s.prev7Sum / s.prev7Count) / (s.prev7PuestosSum / s.prev7Count) * 100
        : null;

      let trendDiff: number | null = null;
      if (recent7Pct !== null && prev7Pct !== null) {
        trendDiff = Math.round((recent7Pct - prev7Pct) * 100) / 100;
      }

      // Aggregate points into weekly buckets for sparkline
      const weeklyMap = new Map<string, { sum: number; puestosSum: number; count: number }>();
      for (const p of s.points) {
        const d = new Date(p.date + "T12:00:00Z");
        const dayOfWeek = d.getUTCDay();
        const diff = d.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
        const key = weekStart.toISOString().slice(0, 10);
        const existing = weeklyMap.get(key);
        if (existing) {
          existing.sum += p.ppcCount;
          existing.puestosSum += p.totalPuestos;
          existing.count++;
        } else {
          weeklyMap.set(key, { sum: p.ppcCount, puestosSum: p.totalPuestos, count: 1 });
        }
      }
      const weeklyPoints = Array.from(weeklyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekDate, w]) => {
          const avgPuestos = w.puestosSum / w.count;
          const avgPpc = w.sum / w.count;
          return {
            date: weekDate,
            label: new Date(weekDate + "T12:00:00Z").toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
            ppcCount: Math.round(avgPpc * 10) / 10,
            ppcPercentage: avgPuestos > 0 ? Math.round((avgPpc / avgPuestos) * 10000) / 100 : 0,
          };
        });

      return {
        installationId,
        name: s.name,
        currentPpcCount: s.latestPpcCount,
        currentTotalPuestos: s.latestTotalPuestos,
        currentPpcPercentage: s.latestPpcPercentage,
        avgPercentage,
        trendDiff,
        weeklyPoints,
      };
    }).sort((a, b) => b.currentPpcPercentage - a.currentPpcPercentage);

    return NextResponse.json({ success: true, data: { rankings } });
  } catch (error) {
    console.error("[OPS] Error fetching PPC installation history:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener historial PPC por instalación" },
      { status: 500 }
    );
  }
}
