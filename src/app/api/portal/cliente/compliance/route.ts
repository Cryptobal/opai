import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const installationId = request.nextUrl.searchParams.get("installationId");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10);
    if (!installationId || !tenantId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.opsRondaEjecucion.findMany({
      where: { tenantId, installationId, scheduledAt: { gte: from } },
      select: { scheduledAt: true, status: true },
    });

    const dailyMap = new Map<string, { total: number; completed: number }>();
    for (const r of rows) {
      const day = r.scheduledAt.toISOString().slice(0, 10);
      const e = dailyMap.get(day) ?? { total: 0, completed: 0 };
      e.total++;
      if (r.status === "completada") e.completed++;
      dailyMap.set(day, e);
    }

    const data = Array.from(dailyMap.entries())
      .map(([date, d]) => ({
        date,
        compliance: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        total: d.total,
        completed: d.completed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Cliente] compliance", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
