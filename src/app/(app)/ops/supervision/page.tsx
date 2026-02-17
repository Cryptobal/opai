import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function OpsSupervisionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
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
    <div className="space-y-6">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Visitas totales</p>
            <p className="text-2xl font-semibold">{totalVisitas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Completadas</p>
            <p className="text-2xl font-semibold">{completedVisitas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Críticas</p>
            <p className="text-2xl font-semibold">{criticas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-semibold">{Math.max(0, totalVisitas - completedVisitas)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas visitas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visitas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay visitas registradas.</p>
          ) : (
            visitas.map((v) => (
              <Link key={v.id} href={`/ops/supervision/${v.id}`} className="block rounded-md border p-3 transition hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.installation.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(v.checkInAt)}
                    </p>
                    {canViewAll && (
                      <p className="text-xs text-muted-foreground">Supervisor: {v.supervisor.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {v.installationState && (
                      <Badge variant="outline">{v.installationState}</Badge>
                    )}
                    <Badge variant={v.status === "completed" ? "default" : "secondary"}>
                      {v.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
