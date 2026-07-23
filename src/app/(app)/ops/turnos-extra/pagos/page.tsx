import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
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
    <div className="min-w-0">
      <TeLotesClient
        initialLotes={JSON.parse(JSON.stringify(lotes))}
        defaultStatusFilter="paid"
      />
    </div>
  );
}
