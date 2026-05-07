import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { PlusCircle } from "lucide-react";
import { TeTurnosClient } from "@/components/ops";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
export default async function OpsTurnosExtraPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/turnos-extra");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const turnos = await prisma.opsTurnoExtra.findMany({
    where: { tenantId, date: { gte: monthStart } },
    include: {
      installation: { select: { id: true, name: true } },
      puesto: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
      refuerzoSolicitud: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="ops-pautas" />
      <PageHero
        icon={<PlusCircle />}
        iconTone="emerald"
        title="Turnos extra"
        subtitle="horas adicionales"
        description="Gestión de turnos extra y horas extra generadas desde asistencia diaria. Lotes de pago y consolidación mensual."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <TeTurnosClient
        initialItems={JSON.parse(JSON.stringify(turnos))}
        defaultStatusFilter="all"
      />
    </div>
  );
}
