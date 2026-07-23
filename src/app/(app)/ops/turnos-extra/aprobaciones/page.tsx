import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { TeTurnosClient } from "@/components/ops";

export default async function OpsTurnosExtraAprobacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/turnos-extra/aprobaciones");
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
    <div className="min-w-0">
      <TeTurnosClient
        initialItems={JSON.parse(JSON.stringify(turnos))}
        defaultStatusFilter="pending"
      />
    </div>
  );
}
