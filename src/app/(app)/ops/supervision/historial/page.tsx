import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Stat, StatGrid } from "@/components/opai-ds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Route,
  AlertTriangle,
  Clock,
  MapPin,
  Star,
  History,
} from "lucide-react";
export default async function HistorialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/historial");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const canViewAll = hasCapability(perms, "supervision_view_all");

  // Supervisor filter: admins see all, supervisors only their own
  const supervisorFilter = canViewAll ? {} : { supervisorId: session.user.id };

  // Date boundaries
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // --- Parallel queries ---
  type VisitRow = {
    id: string;
    checkInAt: Date;
    status: string;
    installationState: string | null;
    ratings: unknown;
    durationMinutes: number | null;
    isExpressFlagged: boolean;
    installation: { name: string; commune: string | null };
    supervisor?: { id: string; name: string };
    _count: { guardEvaluations: number; findings: number; photos: number };
  };
  type AssignmentRow = {
    installationId: string;
    installation: { id: string; name: string; commune: string | null };
  };

  let visitas: VisitRow[];
  let todayCount: number;
  let monthCount: number;
  let openFindings: number;
  let assignments: AssignmentRow[];

  try {
    [visitas, todayCount, monthCount, openFindings, assignments] =
      await Promise.all([
        (prisma.opsVisitaSupervision as any).findMany({
          where: { tenantId, ...supervisorFilter },
          include: {
            installation: { select: { name: true, commune: true } },
            supervisor: { select: { id: true, name: true } },
            _count: {
              select: {
                guardEvaluations: true,
                findings: true,
                photos: true,
              },
            },
          },
          orderBy: [{ checkInAt: "desc" }],
          take: 50,
        }) as Promise<VisitRow[]>,
        prisma.opsVisitaSupervision.count({
          where: { tenantId, ...supervisorFilter, checkInAt: { gte: dayStart } },
        }),
        prisma.opsVisitaSupervision.count({
          where: { tenantId, ...supervisorFilter, checkInAt: { gte: monthStart } },
        }),
        prisma.opsSupervisionFinding.count({
          where: {
            tenantId,
            ...(canViewAll ? {} : { visit: { supervisorId: session.user.id } }),
            status: { in: ["open", "in_progress"] },
          },
        }),
        prisma.opsAsignacionSupervisor.findMany({
          where: { tenantId, ...(canViewAll ? {} : { supervisorId: session.user.id }), isActive: true },
          include: { installation: { select: { id: true, name: true, commune: true } } },
        }),
      ]);
  } catch {
    // Fallback: use select with only pre-migration columns
    const safe = await prisma.opsVisitaSupervision.findMany({
      where: { tenantId, ...supervisorFilter },
      select: {
        id: true,
        checkInAt: true,
        status: true,
        installationState: true,
        ratings: true,
        installation: { select: { name: true, commune: true } },
        supervisor: { select: { id: true, name: true } },
      },
      orderBy: [{ checkInAt: "desc" }],
      take: 50,
    });
    visitas = safe.map((v) => ({
      ...v,
      durationMinutes: null,
      isExpressFlagged: false,
      _count: { guardEvaluations: 0, findings: 0, photos: 0 },
    }));
    [todayCount, monthCount] = await Promise.all([
      prisma.opsVisitaSupervision.count({
        where: { tenantId, ...supervisorFilter, checkInAt: { gte: dayStart } },
      }),
      prisma.opsVisitaSupervision.count({
        where: { tenantId, ...supervisorFilter, checkInAt: { gte: monthStart } },
      }),
    ]);
    openFindings = 0;
    assignments = await prisma.opsAsignacionSupervisor.findMany({
      where: { tenantId, ...(canViewAll ? {} : { supervisorId: session.user.id }), isActive: true },
      include: { installation: { select: { id: true, name: true, commune: true } } },
    });
  }

  // --- Average rating ---
  const ratedVisits = visitas.filter(
    (v) => v.ratings && typeof (v.ratings as any).presentacion === "number",
  );
  const avgRating =
    ratedVisits.length > 0
      ? Math.round(
          (ratedVisits.reduce((sum, v) => {
            const r = v.ratings as {
              presentacion: number;
              orden: number;
              protocolo: number;
            };
            return sum + (r.presentacion + r.orden + r.protocolo) / 3;
          }, 0) /
            ratedVisits.length) *
            10,
        ) / 10
      : null;

  // --- Route suggestions ---
  const uniqueAssignments = Array.from(
    new Map(assignments.map((a) => [a.installationId, a])).values()
  );
  const installationIds = uniqueAssignments.map((a) => a.installationId);

  let lastVisits: { installationId: string; _max: { checkInAt: Date | null } }[] = [];
  let findingsByInstallation: { installationId: string; _count: number }[] = [];

  if (installationIds.length > 0) {
    const groupResult = await prisma.opsVisitaSupervision.groupBy({
      by: ["installationId"],
      where: {
        tenantId,
        ...supervisorFilter,
        installationId: { in: installationIds },
        checkInAt: { gte: monthStart },
      },
      _max: { checkInAt: true },
    });
    lastVisits = groupResult;
    try {
      const findingsGroup = await prisma.opsSupervisionFinding.groupBy({
        by: ["installationId"],
        where: {
          installationId: { in: installationIds },
          status: { in: ["open", "in_progress"] },
        },
        _count: true,
      });
      findingsByInstallation = findingsGroup;
    } catch {
      // Table may not exist yet
    }
  }

  const lastVisitMap = new Map(
    lastVisits.map((lv) => [lv.installationId, lv._max.checkInAt]),
  );
  const findingsMap = new Map(
    findingsByInstallation.map((f) => [f.installationId, f._count]),
  );

  const suggestions = uniqueAssignments
    .map((a) => {
      const lastVisit = lastVisitMap.get(a.installationId);
      const daysSince = lastVisit
        ? Math.floor(
            (Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;
      const openCount = findingsMap.get(a.installationId) ?? 0;
      return {
        installationId: a.installationId,
        name: a.installation.name,
        commune: a.installation.commune,
        daysSinceLastVisit: daysSince,
        openFindings: openCount,
        priority: (openCount > 0 ? 1000 : 0) + (daysSince ?? 999),
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  // --- Labels ---
  const STATUS_LABELS: Record<string, string> = {
    in_progress: "En progreso",
    completed: "Completada",
    cancelled: "Cancelada",
  };

  const INSTALLATION_STATE_LABELS: Record<string, string> = {
    normal: "Normal",
    incidencia: "Con observaciones",
    critico: "Cr\u00edtico",
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<History />}
        iconTone="emerald"
        title="Historial de visitas"
        subtitle="visitas registradas y KPIs"
        description={canViewAll ? "Todas las visitas registradas, KPIs y sugerencias de ruta." : "Tu historial, KPIs personales y sugerencias de ruta."}
      />

      {/* ── KPIs ── */}
      <StatGrid lgCols={4}>
        <Stat
          label="Visitas hoy"
          value={todayCount}
          variant="brand"
          icon={<MapPin />}
        />
        <Stat
          label="Visitas este mes"
          value={monthCount}
          variant="brand"
          icon={<Clock />}
        />
        <Stat
          label="Calificaci\u00f3n promedio"
          value={avgRating !== null ? avgRating.toFixed(1) : "--"}
          hint={
            ratedVisits.length > 0
              ? `${ratedVisits.length} visita${ratedVisits.length > 1 ? "s" : ""} calificada${ratedVisits.length > 1 ? "s" : ""}`
              : "Sin calificaciones"
          }
          variant="ok"
          icon={<Star />}
        />
        <Stat
          label="Hallazgos abiertos"
          value={openFindings}
          variant={openFindings > 0 ? "warn" : "default"}
          icon={<AlertTriangle />}
        />
      </StatGrid>

      {/* ── Route Suggestions ── */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4 text-primary" />
              Sugerencias de ruta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.installationId}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.commune ?? "Sin comuna"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      s.daysSinceLastVisit === null
                        ? "warning"
                        : s.daysSinceLastVisit > 7
                          ? "warning"
                          : "outline"
                    }
                  >
                    {s.daysSinceLastVisit === null
                      ? "Sin visita este mes"
                      : `${s.daysSinceLastVisit}d sin visita`}
                  </Badge>

                  {s.openFindings > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {s.openFindings} hallazgo{s.openFindings > 1 ? "s" : ""}
                    </Badge>
                  )}

                  <Button size="sm" asChild>
                    <Link href="/ops/supervision/nueva-visita">Visitar</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Visit History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visitas registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visitas.length === 0 ? (
            <p className="text-sm sm:text-base text-muted-foreground">
              A\u00fan no hay visitas registradas.
            </p>
          ) : (
            visitas.map((visit) => (
              <Link
                key={visit.id}
                href={`/ops/supervision/${visit.id}`}
                className="flex flex-col gap-2 rounded-md border p-3 transition hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {visit.installation.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                    <span>
                      {new Intl.DateTimeFormat("es-CL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(visit.checkInAt)}
                    </span>

                    {visit.durationMinutes != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {visit.durationMinutes} min
                      </span>
                    )}

                    {canViewAll && visit.supervisor && (
                      <span className="text-primary/70">
                        {visit.supervisor.name}
                      </span>
                    )}

                    {(visit._count.guardEvaluations > 0 ||
                      visit._count.findings > 0 ||
                      visit._count.photos > 0) && (
                      <span>
                        {[
                          visit._count.guardEvaluations > 0 &&
                            `${visit._count.guardEvaluations} eval`,
                          visit._count.findings > 0 &&
                            `${visit._count.findings} hallazgo${visit._count.findings > 1 ? "s" : ""}`,
                          visit._count.photos > 0 &&
                            `${visit._count.photos} foto${visit._count.photos > 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {visit.isExpressFlagged && (
                    <Badge variant="warning" className="text-xs">
                      Express
                    </Badge>
                  )}

                  {visit.installationState && (
                    <Badge
                      variant={
                        visit.installationState === "critico"
                          ? "destructive"
                          : visit.installationState === "incidencia"
                            ? "warning"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {INSTALLATION_STATE_LABELS[visit.installationState] ??
                        visit.installationState}
                    </Badge>
                  )}

                  <Badge
                    variant={
                      visit.status === "completed"
                        ? "success"
                        : visit.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {STATUS_LABELS[visit.status] ?? visit.status}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
