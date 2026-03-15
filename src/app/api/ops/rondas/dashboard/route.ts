import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile } from "@/lib/rondas/timezone";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Default to today
  const now = new Date();
  const start = from ? startOfDayChile(new Date(from)) : startOfDayChile(now);
  const end = to ? endOfDayChile(new Date(to)) : endOfDayChile(now);

  const [rows, alerts, installations] = await Promise.all([
    prisma.opsRondaEjecucion.findMany({
      where: { tenantId, scheduledAt: { gte: start, lte: end } },
      include: {
        rondaTemplate: { select: { name: true, installation: { select: { id: true, name: true } } } },
        guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 500,
    }),
    prisma.opsAlertaRonda.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
      },
      select: { id: true, tipo: true, severidad: true, resuelta: true, installationId: true, createdAt: true },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active", nocturnoEnabled: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Stats
  const completadas = rows.filter((r) => r.status === "completada").length;
  const enCurso = rows.filter((r) => r.status === "en_curso").length;
  const pendientes = rows.filter((r) => r.status === "pendiente").length;
  const noRealizadas = rows.filter((r) => r.status === "no_realizada").length;
  const atrasadas = rows.filter((r) => {
    if (r.status !== "pendiente") return false;
    return new Date(r.scheduledAt) < now;
  }).length;
  const scored = rows.filter((r) => r.trustScore > 0);
  const trustPromedio = scored.length ? Math.round(scored.reduce((a, r) => a + r.trustScore, 0) / scored.length) : 0;
  const alertasActivas = alerts.filter((a) => !a.resuelta).length;

  // Alert distribution by type
  const alertsByType: Record<string, number> = {};
  for (const a of alerts) {
    alertsByType[a.tipo] = (alertsByType[a.tipo] ?? 0) + 1;
  }

  // Installation stats for ranking
  const instMap = new Map<string, { id: string; name: string; completed: number; total: number; trustSum: number; trustCount: number; alerts: number }>();
  for (const inst of installations) {
    instMap.set(inst.id, { id: inst.id, name: inst.name, completed: 0, total: 0, trustSum: 0, trustCount: 0, alerts: 0 });
  }
  for (const r of rows) {
    const instId = r.rondaTemplate?.installation?.id ?? r.installationId;
    if (!instId) continue;
    const entry = instMap.get(instId);
    if (!entry) continue;
    entry.total += 1;
    if (r.status === "completada") entry.completed += 1;
    if (r.trustScore > 0) {
      entry.trustSum += r.trustScore;
      entry.trustCount += 1;
    }
  }
  for (const a of alerts) {
    const entry = instMap.get(a.installationId);
    if (entry) entry.alerts += 1;
  }
  const installationRanking = Array.from(instMap.values())
    .filter((i) => i.total > 0)
    .map((i) => ({
      id: i.id,
      name: i.name,
      completed: i.completed,
      total: i.total,
      compliance: i.total > 0 ? Math.round((i.completed / i.total) * 100) : 0,
      trustAvg: i.trustCount > 0 ? Math.round(i.trustSum / i.trustCount) : null,
      alerts: i.alerts,
    }))
    .sort((a, b) => b.compliance - a.compliance);

  // Daily breakdown for heatmap (group by date + installation)
  const dailyMap = new Map<string, { date: string; completed: number; total: number }>();
  for (const r of rows) {
    const day = new Date(r.scheduledAt).toISOString().slice(0, 10);
    const key = day;
    if (!dailyMap.has(key)) dailyMap.set(key, { date: day, completed: 0, total: 0 });
    const entry = dailyMap.get(key)!;
    entry.total += 1;
    if (r.status === "completada") entry.completed += 1;
  }
  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    success: true,
    data: {
      rows: rows.map((r) => ({
        id: r.id,
        status: r.status,
        checkpointsTotal: r.checkpointsTotal,
        checkpointsCompletados: r.checkpointsCompletados,
        trustScore: r.trustScore,
        scheduledAt: r.scheduledAt,
        installationName: r.rondaTemplate?.installation?.name ?? "Ronda Libre",
        installationId: r.rondaTemplate?.installation?.id ?? r.installationId,
        guardiaName: r.guardia ? `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}` : null,
        templateName: r.rondaTemplate?.name ?? "Ronda",
      })),
      stats: {
        total: rows.length,
        completadas,
        enCurso,
        pendientes,
        noRealizadas,
        atrasadas,
        trustPromedio,
        alertasActivas,
      },
      alertsByType,
      installationRanking,
      dailyBreakdown,
    },
  });
}
