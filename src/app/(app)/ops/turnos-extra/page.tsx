import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsSubnav, TeTurnosClient } from "@/components/ops";

export default async function OpsTurnosExtraPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/turnos-extra");
  }
  const role = session.user.role;
  if (!hasAppAccess(role, "ops")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const turnos = await prisma.opsTurnoExtra.findMany({
    where: { tenantId },
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
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Turnos extra"
        description="Gestión de turnos extra generados desde asistencia diaria."
      />
      <OpsSubnav />
      <TeTurnosClient
        initialItems={JSON.parse(JSON.stringify(turnos))}
        defaultStatusFilter="all"
      />
    </div>
  );
}
