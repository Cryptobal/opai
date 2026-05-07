import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { CheckCircle2 } from "lucide-react";
import { TeTurnosClient } from "@/components/ops";

export default async function TeAprobacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/te/aprobaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const turnos = await prisma.opsTurnoExtra.findMany({
    where: {
      tenantId,
      status: "pending",
    },
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
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="te" />
      <PageHero
        icon={<CheckCircle2 />}
        iconTone="amber"
        title="Aprobaciones RRHH"
        subtitle="validación final"
        description="Aprueba o rechaza turnos extra pendientes."
      />
      <TeTurnosClient
        initialItems={JSON.parse(JSON.stringify(turnos))}
        defaultStatusFilter="pending"
      />
    </div>
  );
}
