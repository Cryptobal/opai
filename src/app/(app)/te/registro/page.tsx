import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { TeSubnav, TeTurnosClient } from "@/components/ops";

export default async function TeRegistroPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/te/registro");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
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
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="TE · Registro"
        description="Listado de turnos extra con estado y monto."
      />
      <TeSubnav />
      <TeTurnosClient initialItems={JSON.parse(JSON.stringify(turnos))} />
    </div>
  );
}
