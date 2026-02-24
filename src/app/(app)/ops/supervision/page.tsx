import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, canEdit, canDelete, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Button } from "@/components/ui/button";
import { SupervisionDashboardClient } from "@/components/supervision/SupervisionDashboardClient";

import { getPeriodBounds, PERIOD_OPTIONS } from "@/lib/supervision-periods";

export default async function OpsSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
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
  const userCanEdit = canEdit(perms, "ops", "supervision");
  const userCanDelete = canDelete(perms, "ops", "supervision") || canViewAll;

  const where = {
    tenantId,
    checkInAt: { gte: dateFrom, lte: dateTo },
    ...(canViewAll ? {} : { supervisorId: session.user.id }),
  };

  const [visitas, totalVisitas, completedVisitas, criticas] = await Promise.all([
    prisma.opsVisitaSupervision.findMany({
      where,
      include: {
        installation: { select: { id: true, name: true, commune: true } },
        supervisor: { select: { id: true, name: true } },
      },
      orderBy: [{ checkInAt: "desc" }],
      take: 25,
    }),
    prisma.opsVisitaSupervision.count({ where }),
    prisma.opsVisitaSupervision.count({ where: { ...where, status: "completed" } }),
    prisma.opsVisitaSupervision.count({ where: { ...where, installationState: "critico" } }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Supervisión"
        description="Control de visitas en terreno, reportes y KPIs."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/ops/supervision/mis-visitas">Mis visitas</Link>
            </Button>
            <Button asChild>
              <Link href="/ops/supervision/nueva-visita">Nueva visita</Link>
            </Button>
          </div>
        }
      />

      <SupervisionDashboardClient
        visitas={visitas.map((v) => ({
          id: v.id,
          checkInAt: v.checkInAt,
          status: v.status,
          installationState: v.installationState,
          installation: v.installation,
          supervisor: v.supervisor,
        }))}
        totals={{
          total: totalVisitas,
          completed: completedVisitas,
          criticas,
          pendientes: Math.max(0, totalVisitas - completedVisitas),
        }}
        periodLabel={periodLabel}
        periodOptions={PERIOD_OPTIONS}
        canViewAll={canViewAll}
        canEdit={userCanEdit}
        canDelete={userCanDelete}
      />
    </div>
  );
}
