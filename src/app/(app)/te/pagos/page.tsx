import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { TeLotesClient, TeSubnav } from "@/components/ops";

export default async function TePagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/te/pagos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
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
      <PageHeader
        title="TE · Pagos"
        description="Historial de lotes pagados y exportables."
      />
      <TeSubnav />
      <TeLotesClient
        initialLotes={JSON.parse(JSON.stringify(lotes))}
        defaultStatusFilter="paid"
      />
    </div>
  );
}
