import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const period = request.nextUrl.searchParams.get("period") || "weekly";
    const count = Math.min(Number(request.nextUrl.searchParams.get("count") || "12"), 52);

    const now = new Date();
    const daysBack = period === "monthly" ? count * 30 : count * 7;
    const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const snapshots = await prisma.opsPpcSnapshot.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: since },
      },
      orderBy: { date: "asc" },
    });

    if (period === "monthly") {
      const grouped = new Map<string, { totalPpc: number; totalGuards: number; count: number; date: string }>();
      for (const s of snapshots) {
        const d = new Date(s.date);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.totalPpc += s.totalPpc;
          existing.totalGuards += s.totalGuards;
          existing.count++;
        } else {
          grouped.set(key, {
            totalPpc: s.totalPpc,
            totalGuards: s.totalGuards,
            count: 1,
            date: key,
          });
        }
      }
      const points = Array.from(grouped.values()).map((g) => ({
        date: g.date,
        label: new Date(g.date + "-15").toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        ppcPercentage: g.totalGuards > 0
          ? Math.round((g.totalPpc / g.count / (g.totalGuards / g.count)) * 10000) / 100
          : 0,
        totalPpc: Math.round(g.totalPpc / g.count),
        totalGuards: Math.round(g.totalGuards / g.count),
      }));

      return NextResponse.json({ success: true, data: { period, points } });
    }

    // Weekly: group by ISO week
    const grouped = new Map<string, { totalPpc: number; totalGuards: number; count: number; weekStart: string }>();
    for (const s of snapshots) {
      const d = new Date(s.date);
      const dayOfWeek = d.getUTCDay();
      const diff = d.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      const key = weekStart.toISOString().slice(0, 10);
      const existing = grouped.get(key);
      if (existing) {
        existing.totalPpc += s.totalPpc;
        existing.totalGuards += s.totalGuards;
        existing.count++;
      } else {
        grouped.set(key, {
          totalPpc: s.totalPpc,
          totalGuards: s.totalGuards,
          count: 1,
          weekStart: key,
        });
      }
    }
    const points = Array.from(grouped.values()).map((g) => ({
      date: g.weekStart,
      label: new Date(g.weekStart + "T12:00:00Z").toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
      ppcPercentage: g.totalGuards > 0
        ? Math.round((g.totalPpc / g.count / (g.totalGuards / g.count)) * 10000) / 100
        : 0,
      totalPpc: Math.round(g.totalPpc / g.count),
      totalGuards: Math.round(g.totalGuards / g.count),
    }));

    return NextResponse.json({ success: true, data: { period, points } });
  } catch (error) {
    console.error("[OPS] Error fetching PPC history:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener historial PPC" },
      { status: 500 }
    );
  }
}
