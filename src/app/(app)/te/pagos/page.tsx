import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { Banknote } from "lucide-react";
import { TeLotesClient } from "@/components/ops";

export default async function TePagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/te/pagos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const lotes = await prisma.opsPagoTeLote.findMany({
    where: {
      tenantId,
      status: "paid",
    },
    include: {
      items: {
        select: {
          id: true,
          amountClp: true,
          status: true,
          turnoExtraId: true,
          guardiaId: true,
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="te" />
      <PageHero
        icon={<Banknote />}
        iconTone="amber"
        eyebrow={["Turnos Extras", "Pagos"]}
        title="Pagos TE"
        subtitle="liquidación al equipo"
        description="Historial de lotes pagados y exportables."
      />
      <TeLotesClient
        initialLotes={JSON.parse(JSON.stringify(lotes))}
        defaultStatusFilter="paid"
      />
    </div>
  );
}
