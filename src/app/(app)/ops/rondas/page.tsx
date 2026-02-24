import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { RondasDashboardClient } from "@/components/ops/rondas";

export default async function OpsRondasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const start = new Date(new Date().toISOString().slice(0, 10));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const rondaDelegate = (prisma as any).opsRondaEjecucion;
  const rows = rondaDelegate
    ? await prisma.opsRondaEjecucion.findMany({
        where: { tenantId, scheduledAt: { gte: start, lte: end } },
        include: {
          rondaTemplate: { select: { name: true, installation: { select: { name: true } } } },
          guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 100,
      })
    : [];

  const stats = {
    total: rows.length,
    completadas: rows.filter((r) => r.status === "completada").length,
    enCurso: rows.filter((r) => r.status === "en_curso").length,
    pendientes: rows.filter((r) => r.status === "pendiente").length,
    noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
    trustPromedio: rows.length ? Math.round(rows.reduce((acc, r) => acc + r.trustScore, 0) / rows.length) : 0,
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Rondas de seguridad"
        description="Ejecución y control de rondas asociadas a instalaciones."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <RondasDashboardClient rows={JSON.parse(JSON.stringify(rows))} stats={stats} />
    </div>
  );
}
