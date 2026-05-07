import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { CalendarDays } from "lucide-react";
import { OpsPautaMensualClient } from "@/components/ops";

export default async function OpsPautaMensualPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pauta-mensual");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "pauta_mensual")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const clients = await prisma.crmAccount.findMany({
    where: {
      tenantId,
      type: "client",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      rut: true,
      installations: {
        where: { status: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="ops-pautas" />
      <PageHero
        icon={<CalendarDays />}
        iconTone="emerald"
        title="Pauta mensual"
        subtitle="plan operativo del mes"
        description="Genera el plan del mes y asigna guardias por puesto y día. Controla las horas planificadas, los turnos extra y las brechas de cobertura."
      />
      <OpsPautaMensualClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        currentUserId={session.user.id}
      />
    </div>
  );
}
