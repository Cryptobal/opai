import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { OpsRefuerzosClient } from "@/components/ops";
import { resolveRefuerzoStatus } from "@/lib/ops-refuerzos";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function OpsRefuerzosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/refuerzos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "turnos_extra")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const rows = await prisma.opsRefuerzoSolicitud.findMany({
    where: { tenantId },
    include: {
      installation: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      puesto: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
      turnoExtra: { select: { id: true, status: true, amountClp: true, paidAt: true } },
    },
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  const now = new Date();
  const data = rows.map((row) => ({
    ...row,
    status: resolveRefuerzoStatus(row.status, row.endAt, now),
    guardPaymentClp: toNumber(row.guardPaymentClp),
    estimatedTotalClp: toNumber(row.estimatedTotalClp),
    turnoExtra: row.turnoExtra
      ? { ...row.turnoExtra, amountClp: toNumber(row.turnoExtra.amountClp) }
      : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Turnos de refuerzo"
        description="Solicitudes de refuerzo por instalación y seguimiento para facturación."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsRefuerzosClient initialItems={JSON.parse(JSON.stringify(data))} />
    </div>
  );
}
