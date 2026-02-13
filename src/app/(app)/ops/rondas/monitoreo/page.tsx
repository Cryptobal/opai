import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsSubnav } from "@/components/ops";
import { RondasSubnav, RondasMonitoreoClient } from "@/components/ops/rondas";

export default async function RondasMonitoreoPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/monitoreo");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const activeRows = await prisma.opsRondaEjecucion.findMany({
    where: { tenantId, status: "en_curso" },
    include: {
      rondaTemplate: {
        include: {
          installation: true,
          checkpoints: { include: { checkpoint: true }, orderBy: { orderIndex: "asc" } },
        },
      },
      guardia: { include: { persona: true } },
      marcaciones: { orderBy: { timestamp: "desc" }, take: 1 },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoreo de rondas"
        description="Seguimiento casi en tiempo real (polling cada 30 segundos)."
      />
      <OpsSubnav />
      <RondasSubnav />
      <RondasMonitoreoClient initialRows={JSON.parse(JSON.stringify(activeRows))} />
    </div>
  );
}
