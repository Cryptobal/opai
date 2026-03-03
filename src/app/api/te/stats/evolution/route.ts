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

    const daysBack = period === "monthly" ? count * 31 : count * 7;
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const teRows = await prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: since },
        status: { in: ["pending", "approved", "paid"] },
      },
      select: { date: true, amountClp: true },
      orderBy: { date: "asc" },
    });

    if (period === "monthly") {
      const grouped = new Map<string, { totalAmount: number; count: number }>();
      for (const te of teRows) {
        const d = new Date(te.date);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const existing = grouped.get(key);
        const amt = Number(te.amountClp);
        if (existing) {
          existing.totalAmount += amt;
          existing.count++;
        } else {
          grouped.set(key, { totalAmount: amt, count: 1 });
        }
      }
      const points = Array.from(grouped.entries()).map(([key, v]) => ({
        date: key,
        label: new Date(key + "-15").toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        totalAmount: Math.round(v.totalAmount),
        count: v.count,
        avgAmount: v.count > 0 ? Math.round(v.totalAmount / v.count) : 0,
      }));
      return NextResponse.json({ success: true, data: { period, points } });
    }

    // Weekly
    const grouped = new Map<string, { totalAmount: number; count: number }>();
    for (const te of teRows) {
      const d = new Date(te.date);
      const dayOfWeek = d.getUTCDay();
      const diff = d.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      const key = weekStart.toISOString().slice(0, 10);
      const existing = grouped.get(key);
      const amt = Number(te.amountClp);
      if (existing) {
        existing.totalAmount += amt;
        existing.count++;
      } else {
        grouped.set(key, { totalAmount: amt, count: 1 });
      }
    }
    const points = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        date: key,
        label: new Date(key + "T12:00:00Z").toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
        totalAmount: Math.round(v.totalAmount),
        count: v.count,
        avgAmount: v.count > 0 ? Math.round(v.totalAmount / v.count) : 0,
      }));

    return NextResponse.json({ success: true, data: { period, points } });
  } catch (error) {
    console.error("[TE] Error fetching evolution:", error);
    return NextResponse.json({ success: false, error: "Error obteniendo evolución TE" }, { status: 500 });
  }
}
