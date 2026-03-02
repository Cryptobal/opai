import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, canEdit, canDelete, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Button } from "@/components/ui/button";
import { SupervisionDashboardEnhanced } from "@/components/supervision/SupervisionDashboardEnhanced";
import { ClipboardList, FileBarChart, Plus } from "lucide-react";

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
  const userCanDelete = canDelete(perms, "ops", "supervision");

  const where = {
    tenantId,
    checkInAt: { gte: dateFrom, lte: dateTo },
    ...(canViewAll ? {} : { supervisorId: session.user.id }),
  };

  // Try with full includes (_count on new relation tables). Fall back
  // to safe query if migration hasn't been applied yet.
  let visitas: {
    id: string;
    checkInAt: Date;
    status: string;
    installationState: string | null;
    durationMinutes: number | null;
    installation: { id: string; name: string; commune: string | null };
    supervisor: { id: string; name: string };
    _count: { guardEvaluations: number; findings: number; photos: number };
  }[];
  try {
    visitas = await prisma.opsVisitaSupervision.findMany({
      where,
      include: {
        installation: { select: { id: true, name: true, commune: true } },
        supervisor: { select: { id: true, name: true } },
        _count: { select: { guardEvaluations: true, findings: true, photos: true } },
      },
      orderBy: [{ checkInAt: "desc" }],
      take: 25,
    });
  } catch {
    // Fallback: use select with only pre-migration columns
    const base = await prisma.opsVisitaSupervision.findMany({
      where,
      select: {
        id: true,
        checkInAt: true,
        status: true,
        installationState: true,
        installation: { select: { id: true, name: true, commune: true } },
        supervisor: { select: { id: true, name: true } },
      },
      orderBy: [{ checkInAt: "desc" }],
      take: 25,
    });
    visitas = base.map((v) => ({
      id: v.id,
      checkInAt: v.checkInAt,
      status: v.status,
      installationState: v.installationState,
      durationMinutes: null,
      installation: v.installation,
      supervisor: { id: v.supervisor.id, name: v.supervisor.name ?? "" },
      _count: { guardEvaluations: 0, findings: 0, photos: 0 },
    }));
  }

  return (
    <div className="space-y-4 min-w-0">
      <PageHeader title="Supervisión" description="Control de visitas en terreno, reportes y KPIs." />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/ops/supervision/mis-visitas">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Mis visitas</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/ops/supervision/reportes">
              <FileBarChart className="h-4 w-4" />
              <span className="hidden sm:inline">Reportes</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/ops/supervision/nueva-visita">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva visita</span>
            </Link>
          </Button>
        </div>
      </div>

      <SupervisionDashboardEnhanced
        visitas={visitas.map((v) => ({
          id: v.id,
          checkInAt: v.checkInAt,
          status: v.status,
          installationState: v.installationState,
          durationMinutes: v.durationMinutes,
          installation: v.installation,
          supervisor: v.supervisor,
          _count: v._count,
        }))}
        periodLabel={periodLabel}
        periodOptions={PERIOD_OPTIONS}
        canViewAll={canViewAll}
        canEdit={userCanEdit}
        canDelete={userCanDelete}
        dateFrom={dateFrom.toISOString().slice(0, 10)}
        dateTo={dateTo.toISOString().slice(0, 10)}
      />
    </div>
  );
}
