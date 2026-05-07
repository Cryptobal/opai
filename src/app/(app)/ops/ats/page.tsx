import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Briefcase } from "lucide-react";
import { AtsDashboardClient } from "@/components/ats/AtsDashboardClient";

export default async function OpsAtsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/ats");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ats")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [jobs, metricas] = await Promise.all([
    prisma.atsJobPosting.findMany({
      where: { tenantId },
      include: {
        installation: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
        channels: { select: { canal: true, estado: true, activo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.$transaction([
      prisma.atsJobPosting.count({ where: { tenantId, estado: "ACTIVO" } }),
      prisma.atsApplication.count({ where: { tenantId } }),
      prisma.atsApplication.count({
        where: { tenantId, etapa: { in: ["EN_REVISION", "ENTREVISTA", "OFERTA"] } },
      }),
      prisma.atsApplication.count({
        where: { tenantId, etapa: "CONTRATADO", etapaAt: { gte: monthStart } },
      }),
    ]),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Briefcase />}
        iconTone="emerald"
        title="Reclutamiento"
        subtitle="pipeline de postulantes"
        description="Gestión de avisos de empleo y pipeline de candidatos."
      />
      <AtsDashboardClient
        initialJobs={JSON.parse(JSON.stringify(jobs))}
        metricas={{
          avisosActivos: metricas[0],
          postulantesTotales: metricas[1],
          enProceso: metricas[2],
          contratadosMes: metricas[3],
        }}
      />
    </div>
  );
}
