import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { formatPersonName } from "@/lib/personas";
import { PageHeader } from "@/components/opai";
import { RondasReportesClient } from "@/components/ops/rondas";
import { RondasSubnav } from "@/components/ops/RondasSubnav";
import { asRouteSnapshot, asWalkRoute } from "@/lib/rondas/ejecucion-map-helpers";

export default async function RondasReportesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/reportes");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Use end-of-today to include all records from today
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const [rows, installationsRaw, guardiasRaw, panicAlerts] = await Promise.all([
    prisma.opsRondaEjecucion.findMany({
      where: { tenantId, scheduledAt: { gte: from, lte: now } },
      include: {
        rondaTemplate: {
          select: {
            name: true,
            installationId: true,
            installation: { select: { id: true, name: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        marcaciones: {
          select: {
            id: true,
            checkpointId: true,
            timestamp: true,
            fotoEvidenciaUrl: true,
            geoDistanciaM: true,
            lat: true,
            lng: true,
            geoValidada: true,
            verificationMethod: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 2000,
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsGuardia.findMany({
      where: { tenantId, status: "active" },
      select: {
        id: true,
        code: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
        currentInstallation: { select: { name: true } },
      },
      orderBy: { persona: { lastName: "asc" } },
    }),
    prisma.opsAlertaRonda.findMany({
      where: { tenantId, tipo: "panico", createdAt: { gte: from, lte: now } },
      select: {
        id: true,
        createdAt: true,
        mensaje: true,
        resuelta: true,
        isAcknowledged: true,
        acknowledgedAt: true,
        installation: { select: { name: true } },
        guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const mapped = rows.map((row) => ({
    id: row.id,
    scheduledAt: row.scheduledAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    installationId: (row as any).installationId ?? row.rondaTemplate?.installationId ?? null,
    installation: row.rondaTemplate?.installation?.name ?? (row as any).installation?.name ?? "Sin instalación",
    template: row.rondaTemplate?.name ?? (row.isAdHoc ? "Ronda Libre" : "Sin plantilla"),
    isAdHoc: row.isAdHoc,
    guardiaId: row.guardiaId,
    guardia: row.guardia
      ? formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)
      : "",
    guardiaCode: row.guardia?.code ?? "",
    rut: row.guardia?.persona.rut ?? "",
    status: row.status,
    checkpointsTotal: row.checkpointsTotal,
    checkpointsCompletados: row.checkpointsCompletados,
    porcentajeCompletado: row.porcentajeCompletado,
    trustScore: row.trustScore,
    trustBreakdown: (row as any).trustBreakdown as Record<string, unknown> | null,
    durationMinutes: (row as any).durationMinutes,
    notes: row.notes ?? null,
    walkRoute: asWalkRoute(row.walkRoute),
    routeSnapshot: asRouteSnapshot(row.routeSnapshot),
    marcaciones: row.marcaciones.map((m) => ({
      id: m.id,
      checkpointName: m.checkpoint?.name ?? (m.checkpointId ? "Checkpoint eliminado" : "Punto GPS"),
      timestamp: m.timestamp.toISOString(),
      status: (m as any).status,
      hasPhoto: !!m.fotoEvidenciaUrl,
      fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
      hasAudio: !!(m as any).audioUrl,
      distanceM: m.geoDistanciaM,
      lat: m.lat,
      lng: m.lng,
      googleMapsUrl: m.lat && m.lng ? `https://maps.google.com/?q=${m.lat},${m.lng}` : null,
      geoValidada: m.geoValidada,
      verificationMethod: m.verificationMethod,
    })),
  }));

  const completadas = rows.filter((r) => r.status === "completada").length;
  const totals = {
    total: rows.length,
    completadas,
    incompletas: rows.filter((r) => r.status === "incompleta").length,
    noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
    compliance: rows.length ? Math.round((completadas / rows.length) * 100) : 0,
    trustPromedio: (() => {
      const prog = rows.filter((r) => !r.isAdHoc);
      return prog.length
        ? Math.round(prog.reduce((acc, r) => acc + (r.trustScore ?? 0), 0) / prog.length)
        : 0;
    })(),
  };

  const dailyMap = new Map<string, { total: number; completed: number }>();
  for (const r of rows) {
    const day = r.scheduledAt.toISOString().slice(0, 10);
    const entry = dailyMap.get(day) ?? { total: 0, completed: 0 };
    entry.total++;
    if (r.status === "completada") entry.completed++;
    dailyMap.set(day, entry);
  }
  const dailyCompliance = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      compliance: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      total: d.total,
      completed: d.completed,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const guardiaOptions = guardiasRaw.map((g) => ({
    id: g.id,
    label: formatPersonName(g.persona.firstName, g.persona.lastName),
    code: g.code ?? "",
    rut: g.persona.rut ?? "",
    installationName: g.currentInstallation?.name ?? "",
  }));

  const panicData = panicAlerts.map((a) => ({
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    mensaje: a.mensaje,
    installation: a.installation?.name ?? "—",
    guardia: a.guardia ? formatPersonName(a.guardia.persona.firstName, a.guardia.persona.lastName) : "—",
    resuelta: a.resuelta,
    isAcknowledged: a.isAcknowledged,
    responseTimeMin: a.acknowledgedAt
      ? Math.round((a.acknowledgedAt.getTime() - a.createdAt.getTime()) / 60000)
      : null,
  }));

  const tenantCfg = await getTenantCompanyConfig(tenantId);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Reportes de rondas"
        description="Cumplimiento, cobertura y confiabilidad por instalación y guardia."
      />
      <RondasSubnav />
      <RondasReportesClient
        initialRows={mapped}
        initialTotals={totals}
        initialDailyCompliance={dailyCompliance}
        installations={installationsRaw}
        guardias={guardiaOptions}
        companyName={tenantCfg.commercialName}
        panicAlerts={panicData}
      />
    </div>
  );
}
