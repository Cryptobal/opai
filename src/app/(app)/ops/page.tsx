import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Stat, StatGrid, Surface } from "@/components/opai-ds";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import {
  Route,
  CalendarDays,
  Clock3,
  Zap,
  Fingerprint,
  ShieldAlert,
  UserRoundCheck,
  Users,
  Building2,
  Ticket,
  Package,
  ClipboardCheck,
  LayoutGrid,
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

  const tenantId = session.user.tenantId;

  const [totalSlots, assignedGuards, activeInstallations, teCount, ppcCount] = await Promise.all([
    prisma.opsPuestoOperativo.aggregate({
      where: { tenantId, active: true },
      _sum: { requiredGuards: true },
    }),
    prisma.opsAsignacionGuardia.count({ where: { tenantId, isActive: true } }),
    prisma.crmInstallation.count({ where: { tenantId, status: "active" } }),
    prisma.opsTurnoExtra.count({ where: { tenantId, status: "pending" } }),
    prisma.opsPautaMensual.count({
      where: {
        tenantId,
        OR: [
          { plannedGuardiaId: null, shiftCode: { not: "-" } },
          { shiftCode: { in: ["V", "L", "P", "PCG", "PSG"] } },
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
    ...(canView(perms, "ops", "supervision")
      ? [
          {
            href: "/ops/supervision",
            title: "Supervisión",
            description: "Visitas de supervisión en terreno, check-in y reportes.",
            icon: ClipboardCheck,
            count: null,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<LayoutGrid />}
        iconTone="emerald"
        eyebrow={["Operaciones"]}
        title="Operaciones"
        subtitle="centro de operaciones"
        description="Operación diaria: pauta, cobertura, asistencia y control."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />

      {/* -- KPI Dotación -- */}
      <StatGrid lgCols={4}>
        <Stat
          label="Instalaciones activas"
          value={activeInstallations}
          icon={<Building2 />}
          variant="brand"
        />
        <Stat
          label="Guardias asignados"
          value={`${guardsAssigned}/${slotsTotal}`}
          icon={<Users />}
          variant="ok"
        />
        <Stat
          label="Vacantes (PPC)"
          value={vacantes}
          icon={<ShieldAlert />}
          variant={vacantes > 0 ? "warn" : "ok"}
        />
        <Stat
          label="Cobertura dotación"
          value={`${slotsTotal > 0 ? Math.round((guardsAssigned / slotsTotal) * 100) : 0}%`}
          icon={<Users />}
          variant="brand"
        />
      </StatGrid>

      {/* -- Módulos: compactos en mobile para ver más sin scroll -- */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Surface elevation={1} padding="sm" hoverable className="h-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-ds-md bg-primary/10 text-primary shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[13px] sm:text-[14px] font-semibold text-ds-text-1">{item.title}</p>
                    <p className="hidden sm:block text-[12px] text-ds-text-3 mt-0.5">{item.description}</p>
                    {item.count != null && (
                      <p className="font-display text-lg sm:text-2xl font-bold text-ds-text-1 ds-num mt-2">{item.count}</p>
                    )}
                  </div>
                </div>
              </Surface>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
