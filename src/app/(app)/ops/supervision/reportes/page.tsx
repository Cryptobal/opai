import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SupervisionReportesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/reportes");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canViewAll = hasCapability(perms, "supervision_view_all");

  const where = {
    tenantId,
    ...(canViewAll ? {} : { supervisorId: session.user.id }),
  };

  const [byState, bySupervisor] = await Promise.all([
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
  ]);

  const supervisors = canViewAll
    ? await prisma.admin.findMany({
        where: { id: { in: bySupervisor.map((b) => b.supervisorId) } },
        select: { id: true, name: true },
      })
    : [];
  const supervisorMap = new Map(supervisors.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes de supervisión"
        description="Resumen consolidado por estado de instalación y supervisor."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado de instalaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {byState.length === 0 ? (
              <p className="text-muted-foreground">Sin datos de estado.</p>
            ) : (
              byState.map((row) => (
                <div key={row.installationState ?? "sin_estado"} className="flex items-center justify-between rounded-md border p-2">
                  <span>{row.installationState ?? "sin_estado"}</span>
                  <span className="font-medium">{row._count._all}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visitas por supervisor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bySupervisor.length === 0 ? (
              <p className="text-muted-foreground">Sin datos de supervisores.</p>
            ) : (
              bySupervisor.map((row) => (
                <div key={row.supervisorId} className="flex items-center justify-between rounded-md border p-2">
                  <span>{supervisorMap.get(row.supervisorId) ?? row.supervisorId}</span>
                  <span className="font-medium">{row._count._all}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
