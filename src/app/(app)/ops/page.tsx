import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader, KpiCard, KpiGrid, ModuleCard } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import {
  Route,
  CalendarDays,
  Clock3,
  Zap,
  Fingerprint,
  ShieldAlert,
  UserRoundCheck,
  Moon,
  Users,
  Building2,
  Ticket,
  Package,
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

  const modules: {
    href: string;
    title: string;
    description: string;
    icon: typeof Zap;
    count: number | string | null;
  }[] = [
    {
      href: "/ops/refuerzos",
      title: "Turnos de refuerzo",
      description: "Solicitudes de refuerzo y control de facturación.",
      icon: Zap,
      count: null,
    },
    {
      href: "/ops/pauta-mensual",
      title: "Pauta mensual",
      description: "Genera y asigna guardias por fecha y puesto.",
      icon: CalendarDays,
      count: null,
    },
    {
      href: "/ops/pauta-diaria",
      title: "Asistencia diaria",
      description: "Marca asistencia, reemplazos y generación TE.",
      icon: UserRoundCheck,
      count: null,
    },
    {
      href: "/ops/turnos-extra",
      title: "Turnos extra",
      description: "Gestión de turnos extra generados desde asistencia.",
      icon: Clock3,
      count: teCount > 0 ? teCount : null,
    },
    {
      href: "/ops/rondas",
      title: "Rondas de seguridad",
      description: "Control de rondas por checkpoints QR con monitoreo en vivo.",
      icon: Route,
      count: null,
    },
    {
      href: "/ops/marcaciones",
      title: "Marcaciones",
      description: "Registro de marcaciones de asistencia digital (Res. Exenta N°38).",
      icon: Fingerprint,
      count: null,
    },
    {
      href: "/ops/ppc",
      title: "Puestos por cubrir (PPC)",
      description: "Brechas de cobertura: sin guardia o con vacaciones/licencia.",
      icon: ShieldAlert,
      count: ppcCount > 0 ? ppcCount : null,
    },
    {
      href: "/ops/control-nocturno",
      title: "Control nocturno",
      description: "Reportes nocturnos de la central de operaciones: rondas, asistencia y novedades.",
      icon: Moon,
      count: null,
    },
    {
      href: "/ops/tickets",
      title: "Tickets",
      description: "Gestión de solicitudes y aprobaciones internas.",
      icon: Ticket,
      count: null,
    },
    {
      href: "/ops/inventario",
      title: "Inventario",
      description: "Uniformes, activos y teléfonos por instalación.",
      icon: Package,
      count: null,
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Operaciones"
        description="Operación diaria: pauta, cobertura, asistencia y control."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />

      {/* -- KPI Dotación -- */}
      <KpiGrid columns={4}>
        <KpiCard
          title="Instalaciones activas"
          value={activeInstallations}
          icon={<Building2 className="h-4.5 w-4.5" />}
          variant="blue"
        />
        <KpiCard
          title="Guardias asignados"
          value={`${guardsAssigned}/${slotsTotal}`}
          icon={<Users className="h-4.5 w-4.5" />}
          variant="emerald"
        />
        <KpiCard
          title="Vacantes (PPC)"
          value={vacantes}
          icon={<ShieldAlert className="h-4.5 w-4.5" />}
          variant={vacantes > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          title="Cobertura dotación"
          value={`${slotsTotal > 0 ? Math.round((guardsAssigned / slotsTotal) * 100) : 0}%`}
          icon={<Users className="h-4.5 w-4.5" />}
          variant="sky"
        />
      </KpiGrid>

      {/* -- Módulos -- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <ModuleCard
            key={item.href}
            title={item.title}
            description={item.description}
            icon={item.icon}
            href={item.href}
            count={item.count ?? undefined}
          />
        ))}
      </div>
    </div>
  );
}
