import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Banknote } from "lucide-react";
import { TeLotesClient } from "@/components/ops";

export default async function OpsTurnosExtraPagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/turnos-extra/pagos");
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
      <PageHero
        icon={<Banknote />}
        iconTone="amber"
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
