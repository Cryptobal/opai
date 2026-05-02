import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { ClipboardClock } from "lucide-react";
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

  const tenantId = session.user.tenantId;
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
      <PageHero
        icon={<ClipboardClock />}
        iconTone="amber"
        eyebrow={["Turnos Extras", "Registro"]}
        title="Registro de TE"
        subtitle="captura desde planilla"
        description="Listado de turnos extra con estado y monto."
      />
      <TeSubnav />
      <TeTurnosClient initialItems={JSON.parse(JSON.stringify(turnos))} />
    </div>
  );
}
