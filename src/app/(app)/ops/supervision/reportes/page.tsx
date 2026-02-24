import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SupervisionReportesClient } from "@/components/supervision/SupervisionReportesClient";
import { getPeriodBounds, PERIOD_OPTIONS } from "@/lib/supervision-periods";

const INSTALLATION_STATE_LABELS: Record<string, string> = {
  normal: "Normal",
  incidencia: "Con observaciones",
  critico: "Crítico",
  sin_estado: "Sin estado",
};

export default async function SupervisionReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/reportes");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const params = await searchParams;
  const periodKey = params.period ?? "30d";
  const { dateFrom, dateTo, label: periodLabel } = getPeriodBounds(periodKey);

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canViewAll = hasCapability(perms, "supervision_view_all");

  const where = {
    tenantId,
    checkInAt: { gte: dateFrom, lte: dateTo },
    ...(canViewAll ? {} : { supervisorId: session.user.id }),
  };

  const [byState, bySupervisor, totalVisitas, completedVisitas] = await Promise.all([
    prisma.opsVisitaSupervision.groupBy({
      by: ["installationState"],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.opsVisitaSupervision.groupBy({
      by: ["supervisorId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.opsVisitaSupervision.count({ where }),
    prisma.opsVisitaSupervision.count({ where: { ...where, status: "completed" } }),
  ]);

  const supervisors = canViewAll
    ? await prisma.admin.findMany({
        where: { id: { in: bySupervisor.map((b) => b.supervisorId) } },
        select: { id: true, name: true },
      })
    : [];
  const supervisorMap = new Map(supervisors.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Reportes de supervisión"
        description="Resumen consolidado por estado de instalación y supervisor."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ops/supervision">Dashboard</Link>
          </Button>
        }
      />

      <SupervisionReportesClient
        byState={byState.map((r) => ({
          key: r.installationState ?? "sin_estado",
          label: INSTALLATION_STATE_LABELS[r.installationState ?? "sin_estado"] ?? r.installationState ?? "Sin estado",
          count: r._count._all,
        }))}
        bySupervisor={bySupervisor.map((r) => ({
          supervisorId: r.supervisorId,
          name: supervisorMap.get(r.supervisorId) ?? r.supervisorId,
          count: r._count._all,
        }))}
        periodLabel={periodLabel}
        periodOptions={PERIOD_OPTIONS}
        totals={{ total: totalVisitas, completed: completedVisitas }}
      />
    </div>
  );
}
