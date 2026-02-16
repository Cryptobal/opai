import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, hasModuleAccess } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { OpsSubnav } from "@/components/ops";
import { Card, CardContent } from "@/components/ui/card";
import {
  Route,
  CalendarDays,
  Clock3,
  Fingerprint,
  ShieldAlert,
  UserRoundCheck,
  Moon,
  Users,
  Building2,
  Ticket,
} from "lucide-react";

export default async function OpsDashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "ops")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [totalSlots, assignedGuards, activeInstallations, teCount, ppcCount] = await Promise.all([
    prisma.opsPuestoOperativo.aggregate({
      where: { tenantId, active: true },
      _sum: { requiredGuards: true },
    }),
    prisma.opsAsignacionGuardia.count({ where: { tenantId, isActive: true } }),
    prisma.crmInstallation.count({ where: { tenantId, isActive: true } }),
    prisma.opsTurnoExtra.count({ where: { tenantId, status: "pending" } }),
    prisma.opsPautaMensual.count({
      where: {
        tenantId,
        OR: [
          { plannedGuardiaId: null, shiftCode: { not: "-" } },
          { shiftCode: { in: ["V", "L", "P"] } },
        ],
      },
    }),
  ]);

  const slotsTotal = totalSlots._sum.requiredGuards ?? 0;
  const guardsAssigned = assignedGuards;
  const vacantes = slotsTotal - guardsAssigned;

  const modules = [
    {
      href: "/ops/pauta-mensual",
      title: "Pauta mensual",
      description: "Genera y asigna guardias por fecha y puesto.",
      icon: CalendarDays,
      count: null,
      color: "text-emerald-400 bg-emerald-400/10",
    },
    {
      href: "/ops/pauta-diaria",
      title: "Asistencia diaria",
      description: "Marca asistencia, reemplazos y generación TE.",
      icon: UserRoundCheck,
      count: null,
      color: "text-purple-400 bg-purple-400/10",
    },
    {
      href: "/ops/turnos-extra",
      title: "Turnos extra",
      description: "Gestión de turnos extra generados desde asistencia.",
      icon: Clock3,
      count: teCount > 0 ? teCount : null,
      color: "text-rose-400 bg-rose-400/10",
    },
    {
      href: "/ops/rondas",
      title: "Rondas de seguridad",
      description: "Control de rondas por checkpoints QR con monitoreo en vivo.",
      icon: Route,
      count: null,
      color: "text-indigo-400 bg-indigo-400/10",
    },
    {
      href: "/ops/marcaciones",
      title: "Marcaciones",
      description: "Registro de marcaciones de asistencia digital (Res. Exenta N°38).",
      icon: Fingerprint,
      count: null,
      color: "text-cyan-400 bg-cyan-400/10",
    },
    {
      href: "/ops/ppc",
      title: "Puestos por cubrir (PPC)",
      description: "Brechas de cobertura: sin guardia o con vacaciones/licencia.",
      icon: ShieldAlert,
      count: ppcCount > 0 ? ppcCount : null,
      color: "text-amber-400 bg-amber-400/10",
    },
    {
      href: "/ops/control-nocturno",
      title: "Control nocturno",
      description: "Reportes nocturnos de la central de operaciones: rondas, asistencia y novedades.",
      icon: Moon,
      count: null,
      color: "text-indigo-400 bg-indigo-400/10",
    },
    {
      href: "/ops/tickets",
      title: "Tickets",
      description: "Gestión de solicitudes y aprobaciones internas.",
      icon: Ticket,
      count: null,
      color: "text-orange-400 bg-orange-400/10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operaciones"
        description="Operación diaria: pauta, cobertura, asistencia y control."
      />
      <OpsSubnav />

      {/* ── KPI Dotación ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/crm/installations">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xl font-bold">{activeInstallations}</p>
                <p className="text-[10px] text-muted-foreground">Instalaciones activas</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/crm/installations">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Users className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xl font-bold">{guardsAssigned}<span className="text-sm font-normal text-muted-foreground">/{slotsTotal}</span></p>
                <p className="text-[10px] text-muted-foreground">Guardias asignados</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/crm/installations">
          <Card className={`transition-colors hover:bg-accent/40 ${vacantes > 0 ? "border-amber-500/30" : ""}`}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${vacantes > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                <ShieldAlert className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className={`text-xl font-bold ${vacantes > 0 ? "text-red-400" : "text-emerald-400"}`}>{vacantes}</p>
                <p className="text-[10px] text-muted-foreground">Vacantes (PPC)</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Users className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xl font-bold">{slotsTotal > 0 ? Math.round((guardsAssigned / slotsTotal) * 100) : 0}<span className="text-sm font-normal text-muted-foreground">%</span></p>
              <p className="text-[10px] text-muted-foreground">Cobertura dotación</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Módulos ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  {item.count !== null && (
                    <p className="mt-2 text-xs text-primary">{item.count} registro(s)</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
