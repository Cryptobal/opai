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
  ClipboardList,
  Clock3,
  Fingerprint,
  ShieldAlert,
  ShieldUser,
  UserRoundCheck,
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

  const [puestosCount, guardiasCount, teCount, ppcCount] = await Promise.all([
    prisma.opsPuestoOperativo.count({ where: { tenantId, active: true } }),
    prisma.opsGuardia.count({ where: { tenantId } }),
    prisma.opsTurnoExtra.count({ where: { tenantId, status: "pending" } }),
    // PPC correcto: puestos sin guardia planificado o con V/L/P
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

  const modules = [
    {
      href: "/ops/puestos",
      title: "Puestos operativos",
      description: "Visualiza estructura base por instalación, horario y días.",
      icon: ClipboardList,
      count: puestosCount,
      color: "text-blue-400 bg-blue-400/10",
    },
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
      href: "/personas/guardias",
      title: "Personas / Guardias",
      description: "Alta de guardias, ficha y control de lista negra.",
      icon: ShieldUser,
      count: guardiasCount,
      color: "text-sky-400 bg-sky-400/10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ops"
        description="Operación diaria: estructura, pauta, cobertura y guardias."
      />
      <OpsSubnav />

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
