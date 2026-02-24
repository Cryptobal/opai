import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { RondasReportesClient } from "@/components/ops/rondas";

export default async function RondasReportesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/reportes");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.opsRondaEjecucion.findMany({
    where: { tenantId, scheduledAt: { gte: from } },
    include: {
      rondaTemplate: { select: { name: true, installation: { select: { name: true } } } },
      guardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 1000,
  });

  const mapped = rows.map((row) => ({
    scheduledAt: row.scheduledAt.toISOString(),
    installation: row.rondaTemplate.installation.name,
    template: row.rondaTemplate.name,
    guardia: row.guardia ? `${row.guardia.persona.firstName} ${row.guardia.persona.lastName}` : "",
    rut: row.guardia?.persona.rut ?? "",
    status: row.status,
    checkpointsTotal: row.checkpointsTotal,
    checkpointsCompletados: row.checkpointsCompletados,
    porcentajeCompletado: row.porcentajeCompletado,
    trustScore: row.trustScore,
  }));

  const totals = {
    total: rows.length,
    completadas: rows.filter((r) => r.status === "completada").length,
    incompletas: rows.filter((r) => r.status === "incompleta").length,
    noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
    compliance: rows.length ? Math.round((rows.filter((r) => r.status === "completada").length / rows.length) * 100) : 0,
    trustPromedio: rows.length ? Math.round(rows.reduce((acc, r) => acc + r.trustScore, 0) / rows.length) : 0,
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Reportes de rondas"
        description="Cumplimiento, cobertura y confiabilidad de rondas por instalación y guardia."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <RondasReportesClient rows={mapped} totals={totals} />
    </div>
  );
}
