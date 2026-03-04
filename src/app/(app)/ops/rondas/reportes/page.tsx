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

export default async function RondasReportesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/reportes");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [rows, installationsRaw, guardiasRaw] = await Promise.all([
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
            status: true,
            fotoEvidenciaUrl: true,
            audioUrl: true,
            geoDistanciaM: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 2000,
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
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
  ]);

  const mapped = rows.map((row) => ({
    id: row.id,
    scheduledAt: row.scheduledAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    installationId: row.installationId ?? row.rondaTemplate.installationId,
    installation: row.rondaTemplate.installation.name,
    template: row.rondaTemplate.name,
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
    trustBreakdown: row.trustBreakdown as Record<string, unknown> | null,
    durationMinutes: row.durationMinutes,
    marcaciones: row.marcaciones.map((m) => ({
      id: m.id,
      checkpointName: m.checkpoint?.name ?? "Checkpoint eliminado",
      timestamp: m.timestamp.toISOString(),
      status: m.status,
      hasPhoto: !!m.fotoEvidenciaUrl,
      hasAudio: !!m.audioUrl,
      distanceM: m.geoDistanciaM,
    })),
  }));

  const completadas = rows.filter((r) => r.status === "completada").length;
  const totals = {
    total: rows.length,
    completadas,
    incompletas: rows.filter((r) => r.status === "incompleta").length,
    noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
    compliance: rows.length ? Math.round((completadas / rows.length) * 100) : 0,
    trustPromedio: rows.length
      ? Math.round(rows.reduce((acc, r) => acc + (r.trustScore ?? 0), 0) / rows.length)
      : 0,
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
      />
    </div>
  );
}
